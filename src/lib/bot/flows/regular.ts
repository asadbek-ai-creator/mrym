import { Composer, InlineKeyboard } from "grammy";
import { TxSource, type Currency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount, toNumber } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import { cancelMenu, sourceKeyboard } from "../keyboards";
import { labels } from "../i18n";
import { finish, onePerRow, onStep } from "../helpers";
import { requireActiveStore, storeLine } from "../stores";
import { esc } from "../format";
import type { BotContext } from "../types";

/**
 * Regular payments, admin only.
 *
 * Each row is a standing instruction: on its day of the month the cron route
 * posts it as an EXPENSE against its store. Nothing here writes a
 * transaction — this only describes what should happen.
 *
 * Wizard: name → amount → day of month → account, filed against the store
 * the admin currently has open.
 */
export const regularFlow = new Composer<BotContext>();

const HOW_MANY_LISTED = 20;

function sourceLabel(ctx: BotContext, source: TxSource): string {
  return ctx.t(source === TxSource.BANK ? "common.bank" : "common.cash");
}

// ---------- Listing ----------

regularFlow.hears(
  labels("btn.regular"),
  requireModule("ADMIN"),
  requireActiveStore,
  async (ctx) => {
    const payments = await prisma.regularPayment.findMany({
      where: { isDeleted: false, companyId: ctx.activeCompany!.id },
      orderBy: [{ dayOfMonth: "asc" }, { name: "asc" }],
      take: HOW_MANY_LISTED,
    });

    const lines = [ctx.t("reg.title"), storeLine(ctx), ctx.t("reg.intro"), ""];
    const kb = new InlineKeyboard();

    if (payments.length === 0) {
      lines.push(ctx.t("reg.none"));
    } else {
      const addRow = onePerRow(kb);
      for (const payment of payments) {
        addRow(
          ctx.t("reg.item", {
            name: payment.name,
            amount: formatMoney(toNumber(payment.amount), payment.currency),
            day: payment.dayOfMonth,
          }),
          `reg:${payment.id}`
        );
      }
      kb.row();
    }
    kb.text(ctx.t("reg.btnAdd"), "regadd");

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }
);

regularFlow.callbackQuery(/^reg:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const payment = await prisma.regularPayment.findUnique({
    where: { id: ctx.match![1] },
    include: { company: { select: { name: true } } },
  });
  if (!payment || payment.isDeleted) {
    await ctx.answerCallbackQuery(ctx.t("reg.notFound"));
    return;
  }
  if (payment.companyId !== ctx.activeCompany?.id) {
    await ctx.answerCallbackQuery({
      text: ctx.t("store.noAccess"),
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.reply(
    ctx.t("reg.card", {
      name: esc(payment.name),
      company: esc(payment.company.name),
      amount: formatMoney(toNumber(payment.amount), payment.currency),
      day: payment.dayOfMonth,
      source: sourceLabel(ctx, payment.source),
    }),
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(
        ctx.t("reg.deleteYes"),
        `regdel:${payment.id}`
      ),
    }
  );
});

// ---------- Creating ----------

regularFlow.callbackQuery(
  "regadd",
  requireModule("ADMIN"),
  requireActiveStore,
  async (ctx) => {
    ctx.session.step = "reg:name";
    ctx.session.draft = {
      companyId: ctx.activeCompany!.id,
      companyName: ctx.activeCompany!.name,
    };
    await ctx.answerCallbackQuery();
    await ctx.reply([storeLine(ctx), "", ctx.t("reg.askName")].join("\n"), {
      parse_mode: "HTML",
      reply_markup: cancelMenu(ctx.locale),
    });
  }
);

onStep(regularFlow, "reg:name", async (ctx) => {
  ctx.session.draft.name = ctx.message!.text!.trim();
  ctx.session.step = "reg:amount";
  await ctx.reply(ctx.t("reg.askAmount"), {
    reply_markup: cancelMenu(ctx.locale),
  });
});

onStep(regularFlow, "reg:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply(ctx.t("common.badAmount", { example: "3000000" }));
    return;
  }
  ctx.session.draft.amount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "reg:day";
  await ctx.reply(
    ctx.t("reg.askDay", { amount: formatMoney(parsed.amount, parsed.currency) }),
    { parse_mode: "HTML", reply_markup: cancelMenu(ctx.locale) }
  );
});

onStep(regularFlow, "reg:day", async (ctx) => {
  const day = Number(ctx.message!.text!.trim());
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    await ctx.reply(ctx.t("reg.badDay"));
    return;
  }
  ctx.session.draft.dayOfMonth = day;
  ctx.session.step = "reg:source";
  await ctx.reply(ctx.t("reg.askSource"), {
    parse_mode: "HTML",
    reply_markup: sourceKeyboard("regsrc", ctx.locale),
  });
});

regularFlow.callbackQuery(
  /^regsrc:(CASH|BANK)$/,
  requireModule("ADMIN"),
  async (ctx) => {
    if (ctx.session.step !== "reg:source") {
      await ctx.answerCallbackQuery(ctx.t("common.stepExpired"));
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);

    const draft = ctx.session.draft;
    const source = ctx.match![1] as TxSource;
    const amount = draft.amount as number;
    const currency = draft.currency as Currency;

    const payment = await prisma.regularPayment.create({
      data: {
        name: draft.name as string,
        amount,
        currency,
        dayOfMonth: draft.dayOfMonth as number,
        source,
        category: "Regular payment",
        companyId: draft.companyId as string,
      },
    });

    await logAction(
      ctx.user.id,
      "REGULAR_PAYMENT_CREATED",
      `${payment.name} · ${formatMoney(amount, currency)} · day ${payment.dayOfMonth} · ${source}`,
      payment.companyId
    );

    await finish(
      ctx,
      ctx.t("reg.created", {
        name: esc(payment.name),
        company: esc(draft.companyName as string),
        amount: formatMoney(amount, currency),
        day: payment.dayOfMonth,
        source: sourceLabel(ctx, source),
      })
    );
  }
);

// ---------- Stopping ----------

regularFlow.callbackQuery(/^regdel:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const payment = await prisma.regularPayment.findUnique({
    where: { id: ctx.match![1] },
  });
  if (!payment || payment.isDeleted) {
    await ctx.answerCallbackQuery(ctx.t("reg.notFound"));
    return;
  }

  // Soft delete, so the expenses this instruction already posted keep their
  // link back to what caused them.
  await prisma.regularPayment.update({
    where: { id: payment.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await logAction(
    ctx.user.id,
    "REGULAR_PAYMENT_STOPPED",
    payment.name,
    payment.companyId
  );

  await ctx.answerCallbackQuery(ctx.t("reg.deleted"));
  await ctx.editMessageText(ctx.t("reg.deleted")).catch(() => undefined);
});
