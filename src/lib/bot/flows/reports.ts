import { Composer, InlineKeyboard, InputFile } from "grammy";
import { format, subMonths } from "date-fns";
import { formatMoney } from "@/lib/money";
import { CURRENCIES, getSummary } from "@/lib/reporting";
import { buildMonthlyWorkbook } from "@/lib/excel";
import { logAction } from "../auth";
import { DATE_LOCALE, labels } from "../i18n";
import type { BotContext } from "../types";

export const reportsFlow = new Composer<BotContext>();

/** How many recent months are offered in the export picker. */
const EXPORT_MONTHS = 6;

// ---------- Balance ----------

reportsFlow.hears(labels("btn.balance"), async (ctx) => {
  const summary = await getSummary();

  const blocks = CURRENCIES.filter((currency) => {
    const totals = summary[currency];
    return totals.totalIncome > 0 || totals.totalExpense > 0 || totals.creditPending > 0;
  }).map((currency) => {
    const totals = summary[currency];
    return [
      `<b>${currency}</b>`,
      ctx.t("balance.cash", { value: formatMoney(totals.cashBalance, currency) }),
      ctx.t("balance.bank", { value: formatMoney(totals.bankBalance, currency) }),
      ctx.t("balance.credits", { value: formatMoney(totals.creditPending, currency) }),
      ctx.t("balance.income", { value: formatMoney(totals.totalIncome, currency) }),
      ctx.t("balance.expense", { value: formatMoney(totals.totalExpense, currency) }),
      ctx.t("balance.margin", { value: formatMoney(totals.netMargin, currency) }),
    ].join("\n");
  });

  await ctx.reply(
    blocks.length
      ? `${ctx.t("balance.title")}\n\n${blocks.join("\n\n")}`
      : ctx.t("balance.empty"),
    { parse_mode: "HTML" }
  );
});

// ---------- Excel export ----------

reportsFlow.hears(labels("btn.exportExcel"), async (ctx) => {
  const dateLocale = DATE_LOCALE[ctx.locale];
  const kb = new InlineKeyboard();

  for (let index = 0; index < EXPORT_MONTHS; index++) {
    const date = subMonths(new Date(), index);
    kb.text(
      format(date, "LLLL yyyy", { locale: dateLocale }),
      `xls:${format(date, "yyyy-MM")}`
    );
    if (index % 2 === 1) kb.row();
  }

  await ctx.reply(ctx.t("export.title"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

reportsFlow.callbackQuery(/^xls:(\d{4})-(\d{2})$/, async (ctx) => {
  const year = Number(ctx.match![1]);
  const month = Number(ctx.match![2]);

  await ctx.answerCallbackQuery(ctx.t("export.building"));
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);

  const { buffer, filename } = await buildMonthlyWorkbook(year, month, ctx.locale);
  await ctx.replyWithDocument(new InputFile(buffer, filename), {
    caption: ctx.t("export.caption", {
      month: format(new Date(year, month - 1), "LLLL yyyy", {
        locale: DATE_LOCALE[ctx.locale],
      }),
    }),
  });

  await logAction(ctx.user.id, "EXPORT_XLSX", filename);
});
