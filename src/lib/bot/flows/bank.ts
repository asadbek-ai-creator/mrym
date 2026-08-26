import { Composer } from "grammy";
import { TxType } from "@prisma/client";
import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import { cancelMenu, dateKeyboard, skipKeyboard } from "../keyboards";
import { labels } from "../i18n";
import { clearInlineKeyboard, onStep, replySaved } from "../helpers";
import { fmtDate, parseDate } from "../format";
import type { BotContext } from "../types";

/**
 * Bank wizard: amount → date → bank name → counterparty → comment.
 * Steps are `bank:amount`, `bank:date`, `bank:name`, `bank:party`, `bank:comment`.
 */
export const bankFlow = new Composer<BotContext>();

async function start(ctx: BotContext, type: TxType) {
  ctx.session.step = "bank:amount";
  ctx.session.draft = { type };
  await ctx.reply(
    `${ctx.t(`bank.title.${type}`)}\n\n${ctx.t("bank.askAmount")}`,
    { parse_mode: "HTML", reply_markup: cancelMenu(ctx.locale) }
  );
}

bankFlow.hears(labels("btn.bankIncome"), requireModule("BANK"), (ctx) =>
  start(ctx, TxType.INCOME)
);
bankFlow.hears(labels("btn.bankExpense"), requireModule("BANK"), (ctx) =>
  start(ctx, TxType.EXPENSE)
);

// --- Step 1: amount ---
onStep(bankFlow, "bank:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply(ctx.t("common.badAmount", { example: "12000000" }));
    return;
  }

  ctx.session.draft.amount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "bank:date";

  await ctx.reply(
    ctx.t("bank.askDate", {
      amount: formatMoney(parsed.amount, parsed.currency),
    }),
    { parse_mode: "HTML", reply_markup: dateKeyboard(ctx.locale) }
  );
});

// --- Step 2: date ---
async function askBankName(ctx: BotContext, date: Date) {
  ctx.session.draft.date = date.toISOString();
  ctx.session.step = "bank:name";
  await ctx.reply(ctx.t("bank.askName", { date: fmtDate(date) }), {
    parse_mode: "HTML",
    reply_markup: cancelMenu(ctx.locale),
  });
}

bankFlow.callbackQuery(
  /^date:(today|yesterday|manual)$/,
  requireModule("BANK"),
  async (ctx) => {
    if (ctx.session.step !== "bank:date") {
      await ctx.answerCallbackQuery(ctx.t("common.stepExpired"));
      return;
    }

    const choice = ctx.match![1];
    await ctx.answerCallbackQuery();
    await clearInlineKeyboard(ctx);

    if (choice === "manual") {
      ctx.session.step = "bank:date_manual";
      await ctx.reply(ctx.t("bank.askManualDate"), {
        parse_mode: "HTML",
        reply_markup: cancelMenu(ctx.locale),
      });
      return;
    }

    const date = choice === "today" ? new Date() : subDays(new Date(), 1);
    await askBankName(ctx, date);
  }
);

onStep(bankFlow, "bank:date_manual", async (ctx) => {
  const date = parseDate(ctx.message!.text!);
  if (!date) {
    await ctx.reply(ctx.t("bank.badDate"));
    return;
  }
  await askBankName(ctx, date);
});

// --- Step 3: bank name ---
onStep(bankFlow, "bank:name", async (ctx) => {
  ctx.session.draft.bankName = ctx.message!.text!.trim();
  ctx.session.step = "bank:party";
  await ctx.reply(ctx.t("bank.askParty"), {
    reply_markup: cancelMenu(ctx.locale),
  });
});

// --- Step 4: counterparty ---
onStep(bankFlow, "bank:party", async (ctx) => {
  ctx.session.draft.counterparty = ctx.message!.text!.trim();
  ctx.session.step = "bank:comment";
  await ctx.reply(ctx.t("common.addComment"), {
    reply_markup: skipKeyboard("bank:skip", ctx.locale),
  });
});

// --- Step 5: comment, then save ---
async function save(ctx: BotContext, comment: string | null) {
  const draft = ctx.session.draft;
  const tx = await prisma.transaction.create({
    data: {
      type: draft.type as TxType,
      source: "BANK",
      amount: draft.amount as number,
      currency: draft.currency as "UZS" | "USD",
      date: new Date(draft.date as string),
      bankName: draft.bankName as string,
      counterparty: draft.counterparty as string,
      comment,
      userId: ctx.user.id,
    },
  });

  await logAction(
    ctx.user.id,
    `BANK_${tx.type}_CREATED`,
    `${formatMoney(draft.amount as number, tx.currency)} · ${tx.bankName} · ${tx.counterparty}`
  );
  await replySaved(ctx, tx);
}

onStep(bankFlow, "bank:comment", (ctx) => save(ctx, ctx.message!.text!.trim()));

bankFlow.callbackQuery("bank:skip", requireModule("BANK"), async (ctx) => {
  if (ctx.session.step !== "bank:comment") {
    await ctx.answerCallbackQuery(ctx.t("common.stepExpired"));
    return;
  }
  await ctx.answerCallbackQuery(ctx.t("common.skipped"));
  await clearInlineKeyboard(ctx);
  await save(ctx, null);
});
