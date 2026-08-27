import { Composer } from "grammy";
import { TxType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAmount, formatMoney } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import {
  cancelMenu,
  categoryFromIndex,
  categoryKeyboard,
  skipKeyboard,
} from "../keyboards";
import { categoryLabel, labels } from "../i18n";
import { clearInlineKeyboard, onStep, replySaved } from "../helpers";
import { requireActiveStore, storeLine } from "../stores";
import type { BotContext } from "../types";

/**
 * Cash wizard: amount → category → comment.
 * Steps are `cash:amount`, `cash:category`, `cash:comment`.
 *
 * The store is never asked for. It is whatever the user last switched to, so
 * a shift cannot drift into the wrong books one entry at a time.
 */
export const cashFlow = new Composer<BotContext>();

async function start(ctx: BotContext, type: TxType) {
  ctx.session.step = "cash:amount";
  ctx.session.draft = { type, companyId: ctx.activeCompany!.id };

  await ctx.reply(
    [
      ctx.t(`cash.title.${type}`),
      storeLine(ctx),
      "",
      ctx.t("cash.askAmount"),
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: cancelMenu(ctx.locale) }
  );
}

cashFlow.hears(labels("btn.cashIncome"), requireModule("CASH"), requireActiveStore, (ctx) =>
  start(ctx, TxType.INCOME)
);
cashFlow.hears(labels("btn.cashExpense"), requireModule("CASH"), requireActiveStore, (ctx) =>
  start(ctx, TxType.EXPENSE)
);

// --- Step 1: amount ---
onStep(cashFlow, "cash:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply(ctx.t("common.badAmount", { example: "250000" }));
    return;
  }

  ctx.session.draft.amount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "cash:category";

  const type = ctx.session.draft.type as TxType;
  await ctx.reply(
    ctx.t("cash.askCategory", {
      amount: formatMoney(parsed.amount, parsed.currency),
    }),
    { parse_mode: "HTML", reply_markup: categoryKeyboard(type, ctx.locale) }
  );
});

// --- Step 2: category ---
cashFlow.callbackQuery(/^cat:(\d+)$/, requireModule("CASH"), async (ctx) => {
  if (ctx.session.step !== "cash:category") {
    await ctx.answerCallbackQuery(ctx.t("common.stepExpired"));
    return;
  }

  const type = ctx.session.draft.type as TxType;
  const category = categoryFromIndex(type, Number(ctx.match![1]));
  if (!category) {
    await ctx.answerCallbackQuery(ctx.t("cash.unknownCategory"));
    return;
  }

  ctx.session.draft.category = category;
  ctx.session.step = "cash:comment";

  const shown = categoryLabel(ctx.locale, category);
  await ctx.answerCallbackQuery(shown);
  await clearInlineKeyboard(ctx);
  await ctx.reply(ctx.t("cash.categoryChosen", { category: shown }), {
    parse_mode: "HTML",
    reply_markup: skipKeyboard("cash:skip", ctx.locale),
  });
});

// --- Step 3: comment, then save ---
async function save(ctx: BotContext, comment: string | null) {
  const draft = ctx.session.draft;
  const tx = await prisma.transaction.create({
    data: {
      type: draft.type as TxType,
      source: "CASH",
      amount: draft.amount as number,
      currency: draft.currency as "UZS" | "USD",
      category: draft.category as string,
      comment,
      companyId: draft.companyId as string,
      userId: ctx.user.id,
    },
  });

  await logAction(
    ctx.user.id,
    `CASH_${tx.type}_CREATED`,
    `${formatMoney(draft.amount as number, tx.currency)} · ${tx.category}`,
    tx.companyId
  );
  await replySaved(ctx, tx);
}

onStep(cashFlow, "cash:comment", (ctx) => save(ctx, ctx.message!.text!.trim()));

cashFlow.callbackQuery("cash:skip", requireModule("CASH"), async (ctx) => {
  if (ctx.session.step !== "cash:comment") {
    await ctx.answerCallbackQuery(ctx.t("common.stepExpired"));
    return;
  }
  await ctx.answerCallbackQuery(ctx.t("common.skipped"));
  await clearInlineKeyboard(ctx);
  await save(ctx, null);
});
