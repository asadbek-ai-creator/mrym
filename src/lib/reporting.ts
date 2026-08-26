import { Currency } from "@prisma/client";
import { format, startOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";

export const CURRENCIES: Currency[] = [Currency.UZS, Currency.USD];

export interface CurrencyTotals {
  currency: Currency;
  cashIncome: number;
  cashExpense: number;
  bankIncome: number;
  bankExpense: number;
  /** Credit instalments already marked as paid. */
  creditPaid: number;
  /** Credit instalments still outstanding. */
  creditPending: number;
  cashBalance: number;
  bankBalance: number;
  totalIncome: number;
  totalExpense: number;
  /** (all incomes) − (all expenses + paid credits) */
  netMargin: number;
}

function emptyTotals(currency: Currency): CurrencyTotals {
  return {
    currency,
    cashIncome: 0,
    cashExpense: 0,
    bankIncome: 0,
    bankExpense: 0,
    creditPaid: 0,
    creditPending: 0,
    cashBalance: 0,
    bankBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    netMargin: 0,
  };
}

function derive(totals: CurrencyTotals): CurrencyTotals {
  totals.cashBalance = totals.cashIncome - totals.cashExpense;
  totals.bankBalance = totals.bankIncome - totals.bankExpense;
  totals.totalIncome = totals.cashIncome + totals.bankIncome;
  totals.totalExpense = totals.cashExpense + totals.bankExpense;
  totals.netMargin = totals.totalIncome - (totals.totalExpense + totals.creditPaid);
  return totals;
}

/**
 * All-time figures per currency.
 *
 * Amounts are kept separate per currency rather than converted: the system
 * stores no exchange rate, so summing UZS and USD would produce a number that
 * means nothing.
 */
export async function getSummary(): Promise<Record<Currency, CurrencyTotals>> {
  const [txGroups, credits] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["source", "type", "currency"],
      _sum: { amount: true },
    }),
    prisma.credit.findMany({
      select: {
        currency: true,
        payments: { select: { amount: true, isPaid: true } },
      },
    }),
  ]);

  const result = Object.fromEntries(
    CURRENCIES.map((currency) => [currency, emptyTotals(currency)])
  ) as Record<Currency, CurrencyTotals>;

  for (const group of txGroups) {
    const totals = result[group.currency];
    const amount = toNumber(group._sum.amount);
    if (group.source === "CASH") {
      if (group.type === "INCOME") totals.cashIncome += amount;
      else totals.cashExpense += amount;
    } else {
      if (group.type === "INCOME") totals.bankIncome += amount;
      else totals.bankExpense += amount;
    }
  }

  for (const credit of credits) {
    const totals = result[credit.currency];
    for (const payment of credit.payments) {
      const amount = toNumber(payment.amount);
      if (payment.isPaid) totals.creditPaid += amount;
      else totals.creditPending += amount;
    }
  }

  for (const currency of CURRENCIES) derive(result[currency]);
  return result;
}

export interface CategorySlice {
  category: string;
  amount: number;
}

/** How many expense categories are charted before the tail folds into "Other". */
const CATEGORY_SLOTS = 5;

/**
 * Expense totals by category, largest first. Anything past the fifth category
 * is folded into a single "Other" slice, because past ~6 segments adjacent
 * colours stop being tellable apart.
 */
export async function getExpenseBreakdown(): Promise<Record<Currency, CategorySlice[]>> {
  const groups = await prisma.transaction.groupBy({
    by: ["currency", "source", "category"],
    where: { type: "EXPENSE" },
    _sum: { amount: true },
  });

  return Object.fromEntries(
    CURRENCIES.map((currency) => {
      // Bank transactions carry a counterparty rather than a category, so they
      // are charted as one bucket instead of a meaningless "Uncategorised".
      const merged = new Map<string, number>();
      for (const group of groups) {
        if (group.currency !== currency) continue;
        const label =
          group.category?.trim() ||
          (group.source === "BANK" ? "Bank transfers" : "Uncategorised");
        merged.set(label, (merged.get(label) ?? 0) + toNumber(group._sum.amount));
      }

      const slices = [...merged]
        .map(([category, amount]) => ({ category, amount }))
        .filter((slice) => slice.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      if (slices.length <= CATEGORY_SLOTS + 1) return [currency, slices];

      const head = slices.slice(0, CATEGORY_SLOTS);
      const tail = slices.slice(CATEGORY_SLOTS);
      head.push({
        category: "Other",
        amount: tail.reduce((total, slice) => total + slice.amount, 0),
      });
      return [currency, head];
    })
  ) as Record<Currency, CategorySlice[]>;
}

export interface MonthPoint {
  /** `yyyy-MM`, used as a stable key. */
  month: string;
  /** `MMM yyyy`, used as the chart label. */
  label: string;
  income: number;
  expense: number;
  creditPaid: number;
  margin: number;
}

/**
 * Income / expense / margin for each of the last `months` months, per currency.
 * Aggregated in JS because the row counts here are small and it keeps the
 * month bucketing free of database timezone surprises.
 */
export async function getMonthlySeries(
  months = 12
): Promise<Record<Currency, MonthPoint[]>> {
  const from = startOfMonth(subMonths(new Date(), months - 1));

  const [transactions, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: from } },
      select: { date: true, type: true, amount: true, currency: true },
    }),
    prisma.creditPayment.findMany({
      where: { isPaid: true, paidDate: { gte: from } },
      select: { paidDate: true, amount: true, credit: { select: { currency: true } } },
    }),
  ]);

  const buckets = Object.fromEntries(
    CURRENCIES.map((currency) => {
      const points = Array.from({ length: months }, (_, index) => {
        const date = startOfMonth(subMonths(new Date(), months - 1 - index));
        return {
          month: format(date, "yyyy-MM"),
          label: format(date, "MMM yyyy"),
          income: 0,
          expense: 0,
          creditPaid: 0,
          margin: 0,
        } satisfies MonthPoint;
      });
      return [currency, points];
    })
  ) as Record<Currency, MonthPoint[]>;

  const findPoint = (currency: Currency, date: Date) =>
    buckets[currency].find((point) => point.month === format(date, "yyyy-MM"));

  for (const tx of transactions) {
    const point = findPoint(tx.currency, tx.date);
    if (!point) continue;
    if (tx.type === "INCOME") point.income += toNumber(tx.amount);
    else point.expense += toNumber(tx.amount);
  }

  for (const payment of payments) {
    const point = findPoint(payment.credit.currency, payment.paidDate!);
    if (!point) continue;
    point.creditPaid += toNumber(payment.amount);
  }

  for (const currency of CURRENCIES) {
    for (const point of buckets[currency]) {
      point.margin = point.income - (point.expense + point.creditPaid);
    }
  }

  return buckets;
}
