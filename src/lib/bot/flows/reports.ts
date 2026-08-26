import { Composer, InlineKeyboard, InputFile } from "grammy";
import { format, subMonths } from "date-fns";
import { formatMoney } from "@/lib/money";
import { CURRENCIES, getSummary } from "@/lib/reporting";
import { buildMonthlyWorkbook } from "@/lib/excel";
import { logAction } from "../auth";
import { BTN } from "../keyboards";
import type { BotContext } from "../types";

export const reportsFlow = new Composer<BotContext>();

/** How many recent months are offered in the export picker. */
const EXPORT_MONTHS = 6;

// ---------- Balance ----------

reportsFlow.hears(BTN.balance, async (ctx) => {
  const summary = await getSummary();

  const blocks = CURRENCIES.filter((currency) => {
    const totals = summary[currency];
    return totals.totalIncome > 0 || totals.totalExpense > 0 || totals.creditPending > 0;
  }).map((currency) => {
    const t = summary[currency];
    return [
      `<b>${currency}</b>`,
      `💵 Cash balance: ${formatMoney(t.cashBalance, currency)}`,
      `🏦 Bank balance: ${formatMoney(t.bankBalance, currency)}`,
      `💳 Credits pending: ${formatMoney(t.creditPending, currency)}`,
      `📈 Income: ${formatMoney(t.totalIncome, currency)}`,
      `📉 Expense: ${formatMoney(t.totalExpense, currency)}`,
      `🎯 Net margin: ${formatMoney(t.netMargin, currency)}`,
    ].join("\n");
  });

  await ctx.reply(
    blocks.length
      ? `📊 <b>Balance</b>\n\n${blocks.join("\n\n")}`
      : "📊 There is no data yet.",
    { parse_mode: "HTML" }
  );
});

// ---------- Excel export ----------

reportsFlow.hears(BTN.exportExcel, async (ctx) => {
  const kb = new InlineKeyboard();
  for (let index = 0; index < EXPORT_MONTHS; index++) {
    const date = subMonths(new Date(), index);
    kb.text(format(date, "MMMM yyyy"), `xls:${format(date, "yyyy-MM")}`);
    if (index % 2 === 1) kb.row();
  }

  await ctx.reply("📁 <b>Excel export</b>\n\nChoose a month:", {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

reportsFlow.callbackQuery(/^xls:(\d{4})-(\d{2})$/, async (ctx) => {
  const year = Number(ctx.match![1]);
  const month = Number(ctx.match![2]);

  await ctx.answerCallbackQuery("Building the report…");
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);

  const { buffer, filename } = await buildMonthlyWorkbook(year, month);
  await ctx.replyWithDocument(new InputFile(buffer, filename), {
    caption: `📁 Report for ${format(new Date(year, month - 1), "MMMM yyyy")}`,
  });

  await logAction(ctx.user.id, "EXPORT_XLSX", filename);
});
