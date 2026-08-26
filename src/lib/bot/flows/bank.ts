import { Composer } from "grammy";
import { TxType } from "@prisma/client";
import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import { BTN, cancelMenu, dateKeyboard, skipKeyboard } from "../keyboards";
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
  const label = type === TxType.INCOME ? "income" : "expense";
  await ctx.reply(
    `🏦 <b>Bank ${label}</b>\n\nEnter the amount.\n` +
      "<i>Examples: 12 000 000 · 4500.50 · 300 USD</i>",
    { parse_mode: "HTML", reply_markup: cancelMenu() }
  );
}

bankFlow.hears(BTN.bankIncome, requireModule("BANK"), (ctx) =>
  start(ctx, TxType.INCOME)
);
bankFlow.hears(BTN.bankExpense, requireModule("BANK"), (ctx) =>
  start(ctx, TxType.EXPENSE)
);

// --- Step 1: amount ---
onStep(bankFlow, "bank:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply("⚠️ I could not read that amount. Try again, e.g. 12000000");
    return;
  }

  ctx.session.draft.amount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "bank:date";

  await ctx.reply(
    `Amount: <b>${formatMoney(parsed.amount, parsed.currency)}</b>\n\nChoose the transaction date:`,
    { parse_mode: "HTML", reply_markup: dateKeyboard() }
  );
});

// --- Step 2: date ---
async function askBankName(ctx: BotContext, date: Date) {
  ctx.session.draft.date = date.toISOString();
  ctx.session.step = "bank:name";
  await ctx.reply(
    `Date: <b>${fmtDate(date)}</b>\n\nEnter the bank name:`,
    { parse_mode: "HTML", reply_markup: cancelMenu() }
  );
}

bankFlow.callbackQuery(
  /^date:(today|yesterday|manual)$/,
  requireModule("BANK"),
  async (ctx) => {
    if (ctx.session.step !== "bank:date") {
      await ctx.answerCallbackQuery("This step is no longer active.");
      return;
    }

    const choice = ctx.match![1];
    await ctx.answerCallbackQuery();
    await clearInlineKeyboard(ctx);

    if (choice === "manual") {
      ctx.session.step = "bank:date_manual";
      await ctx.reply("Enter the date as <b>dd.mm.yyyy</b> (e.g. 05.03.2026):", {
        parse_mode: "HTML",
        reply_markup: cancelMenu(),
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
    await ctx.reply("⚠️ Invalid date. Use the format dd.mm.yyyy, e.g. 05.03.2026");
    return;
  }
  await askBankName(ctx, date);
});

// --- Step 3: bank name ---
onStep(bankFlow, "bank:name", async (ctx) => {
  ctx.session.draft.bankName = ctx.message!.text!.trim();
  ctx.session.step = "bank:party";
  await ctx.reply("Enter the counterparty (who paid / who was paid):", {
    reply_markup: cancelMenu(),
  });
});

// --- Step 4: counterparty ---
onStep(bankFlow, "bank:party", async (ctx) => {
  ctx.session.draft.counterparty = ctx.message!.text!.trim();
  ctx.session.step = "bank:comment";
  await ctx.reply("Add a comment:", { reply_markup: skipKeyboard("bank:skip") });
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
    await ctx.answerCallbackQuery("This step is no longer active.");
    return;
  }
  await ctx.answerCallbackQuery("Skipped");
  await clearInlineKeyboard(ctx);
  await save(ctx, null);
});
