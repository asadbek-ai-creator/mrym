import * as XLSX from "xlsx-js-style";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { categoryLabel, t } from "@/lib/bot/i18n";

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F2937" } },
  alignment: { horizontal: "center" as const, vertical: "center" as const },
};

const MONEY_FMT = "#,##0.00";

function sheetFromRows(
  header: string[],
  rows: (string | number)[][],
  moneyColumns: number[],
  widths: number[]
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = widths.map((width) => ({ wch: width }));
  sheet["!freeze"] = { xSplit: "0", ySplit: "1" };

  for (let col = 0; col < header.length; col++) {
    const address = XLSX.utils.encode_cell({ r: 0, c: col });
    if (sheet[address]) sheet[address].s = HEADER_STYLE;
  }

  for (let row = 1; row <= rows.length; row++) {
    for (const col of moneyColumns) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (sheet[address]) sheet[address].z = MONEY_FMT;
    }
  }

  return sheet;
}

/**
 * Builds a workbook with every transaction and credit instalment that falls in
 * the given month. Returns the raw xlsx bytes plus a suggested file name.
 */
export async function buildMonthlyWorkbook(
  year: number,
  month: number,
  locale: Locale = Locale.RU
): Promise<{ buffer: Buffer; filename: string }> {
  const tr = (key: Parameters<typeof t>[1]) => t(locale, key);
  const from = startOfMonth(new Date(year, month - 1, 1));
  const to = endOfMonth(from);

  const [transactions, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      include: { user: { select: { name: true, role: true } } },
    }),
    prisma.creditPayment.findMany({
      where: {
        OR: [
          { dueDate: { gte: from, lte: to } },
          { paidDate: { gte: from, lte: to } },
        ],
      },
      orderBy: { dueDate: "asc" },
      include: { credit: { select: { bankName: true, currency: true } } },
    }),
  ]);

  const workbook = XLSX.utils.book_new();

  // --- Transactions ---
  const txRows = transactions.map((tx) => [
    format(tx.date, "dd.MM.yyyy"),
    tr(tx.source === "CASH" ? "common.cash" : "common.bank"),
    tr(tx.type === "INCOME" ? "common.income" : "common.expense"),
    toNumber(tx.amount),
    tx.currency,
    tx.category ? categoryLabel(locale, tx.category) : "",
    tx.bankName ?? "",
    tx.counterparty ?? "",
    tx.comment ?? "",
    tx.user.name,
    tr(`role.${tx.user.role}`),
  ]);

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        tr("xls.date"),
        tr("xls.source"),
        tr("xls.type"),
        tr("xls.amount"),
        tr("xls.currency"),
        tr("xls.category"),
        tr("xls.bank"),
        tr("xls.counterparty"),
        tr("xls.comment"),
        tr("xls.addedBy"),
        tr("xls.role"),
      ],
      txRows,
      [3],
      [12, 10, 10, 16, 10, 18, 18, 22, 30, 18, 12]
    ),
    tr("xls.sheetTransactions")
  );

  // --- Credit instalments ---
  const paymentRows = payments.map((payment) => [
    payment.credit.bankName,
    format(payment.dueDate, "dd.MM.yyyy"),
    toNumber(payment.amount),
    payment.credit.currency,
    tr(payment.isPaid ? "xls.paid" : "xls.pending"),
    payment.paidDate ? format(payment.paidDate, "dd.MM.yyyy") : "",
  ]);

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        tr("xls.bank"),
        tr("xls.dueDate"),
        tr("xls.amount"),
        tr("xls.currency"),
        tr("xls.status"),
        tr("xls.paidOn"),
      ],
      paymentRows,
      [2],
      [22, 14, 16, 10, 12, 14]
    ),
    tr("xls.sheetPayments")
  );

  // --- Summary ---
  const currencies = [...new Set(transactions.map((tx) => tx.currency))];
  const summaryRows = currencies.map((currency) => {
    const scoped = transactions.filter((tx) => tx.currency === currency);
    const sum = (source: string, type: string) =>
      scoped
        .filter((tx) => tx.source === source && tx.type === type)
        .reduce((total, tx) => total + toNumber(tx.amount), 0);

    const cashIncome = sum("CASH", "INCOME");
    const cashExpense = sum("CASH", "EXPENSE");
    const bankIncome = sum("BANK", "INCOME");
    const bankExpense = sum("BANK", "EXPENSE");
    const creditPaid = payments
      .filter((p) => p.isPaid && p.credit.currency === currency)
      .reduce((total, p) => total + toNumber(p.amount), 0);

    return [
      currency,
      cashIncome,
      cashExpense,
      bankIncome,
      bankExpense,
      creditPaid,
      cashIncome + bankIncome - (cashExpense + bankExpense + creditPaid),
    ];
  });

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        tr("xls.currency"),
        tr("xls.cashIncome"),
        tr("xls.cashExpense"),
        tr("xls.bankIncome"),
        tr("xls.bankExpense"),
        tr("xls.creditsPaid"),
        tr("xls.netMargin"),
      ],
      summaryRows,
      [1, 2, 3, 4, 5, 6],
      [10, 16, 16, 16, 16, 16, 18]
    ),
    tr("xls.sheetSummary")
  );

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  return { buffer, filename: `report-${format(from, "yyyy-MM")}.xlsx` };
}
