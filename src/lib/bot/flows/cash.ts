import { Composer } from "grammy";
import { TxType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAmount, formatMoney } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import {
  BTN,
  cancelMenu,
  categoryFromIndex,
  categoryKeyboard,
  skipKeyboard,
} from "../keyboards";
import { clearInlineKeyboard, onStep, replySaved } from "../helpers";
import type { BotContext } from "../types";

/**
 * Cash wizard: amount → category → comment.
 * Steps are `cash:amount`, `cash:category`, `cash:comment`.
 */
export const cashFlow = new Composer<BotContext>();

async function start(ctx: BotContext, type: TxType) {
  ctx.session.step = "cash:amount";
  ctx.session.draft = { type };
  const label = type === TxType.INCOME ? "income" : "expense";
  await ctx.reply(
    `💵 <b>Cash ${label}</b>\n\nEnter the amount.\n` +
      "<i>Examples: 1 500 000 · 250000 · 300 USD</i>",
    { parse_mode: "HTML", reply_markup: cancelMenu() }
  );
}

cashFlow.hears(BTN.cashIncome, requireModule("CASH"), (ctx) =>
  start(ctx, TxType.INCOME)
);
cashFlow.hears(BTN.cashExpense, requireModule("CASH"), (ctx) =>
  start(ctx, TxType.EXPENSE)
);

// --- Step 1: amount ---
onStep(cashFlow, "cash:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply("⚠️ I could not read that amount. Try again, e.g. 250000");
    return;
  }

  ctx.session.draft.amount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "cash:category";

  const type = ctx.session.draft.type as TxType;
  await ctx.reply(
    `Amount: <b>${formatMoney(parsed.amount, parsed.currency)}</b>\n\nChoose a category:`,
    { parse_mode: "HTML", reply_markup: categoryKeyboard(type) }
  );
});

// --- Step 2: category ---
cashFlow.callbackQuery(/^cat:(\d+)$/, requireModule("CASH"), async (ctx) => {
  if (ctx.session.step !== "cash:category") {
    await ctx.answerCallbackQuery("This step is no longer active.");
    return;
  }

  const type = ctx.session.draft.type as TxType;
  const category = categoryFromIndex(type, Number(ctx.match![1]));
  if (!category) {
    await ctx.answerCallbackQuery("Unknown category.");
    return;
  }

  ctx.session.draft.category = category;
  ctx.session.step = "cash:comment";

  await ctx.answerCallbackQuery(category);
  await clearInlineKeyboard(ctx);
  await ctx.reply(`Category: <b>${category}</b>\n\nAdd a comment:`, {
    parse_mode: "HTML",
    reply_markup: skipKeyboard("cash:skip"),
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
      userId: ctx.user.id,
    },
  });

  await logAction(
    ctx.user.id,
    `CASH_${tx.type}_CREATED`,
    `${formatMoney(draft.amount as number, tx.currency)} · ${tx.category}`
  );
  await replySaved(ctx, tx);
}

onStep(cashFlow, "cash:comment", (ctx) => save(ctx, ctx.message!.text!.trim()));

cashFlow.callbackQuery("cash:skip", requireModule("CASH"), async (ctx) => {
  if (ctx.session.step !== "cash:comment") {
    await ctx.answerCallbackQuery("This step is no longer active.");
    return;
  }
  await ctx.answerCallbackQuery("Skipped");
  await clearInlineKeyboard(ctx);
  await save(ctx, null);
});
