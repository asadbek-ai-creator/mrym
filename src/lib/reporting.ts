import { Currency, Locale, Prisma } from "@prisma/client";
import { cacheLife, cacheTag } from "next/cache";
import { format, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { categoryLabel } from "@/lib/bot/i18n";

export const CURRENCIES: Currency[] = [Currency.UZS, Currency.USD];

/**
 * The cache tag every report shares.
 *
 * One tag rather than one per company: a write against any company changes
 * both that company's figures and the aggregate "all companies" view, so the
 * two would always be invalidated together anyway.
 */
export const REPORTS_TAG = "reports";

/**
 * `null` means every company aggregated; a string isolates one.
 *
 * The filter is an argument rather than ambient state so it becomes part of
 * the `use cache` key — each company gets its own cache entry.
 */
export type CompanyFilter = string | null;

/** Soft-deleted rows are invisible to every report. */
function scope(companyId: CompanyFilter): Prisma.TransactionWhereInput {
  return {
    isDeleted: false,
    ...(companyId ? { companyId } : {}),
  };
}

export interface CurrencyTotals {
  currency: Currency;
  cashIncome: number;
  cashExpense: number;
  bankIncome: number;
  bankExpense: number;
  /** Credit instalments already marked as paid. */
  creditPaid: number;
  /** Credit instalments still outstanding — the residual. */
  creditPending: number;
  cashBalance: number;
  bankBalance: number;
  totalIncome: number;
  totalExpense: number;
  /** (all incomes) − (all expenses) */
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
  // Credit instalments and regular payments reach the books as ordinary
  // EXPENSE transactions the moment they are processed, so they are already
  // inside `totalExpense`. Subtracting `creditPaid` again here would count
  // every repayment twice.
  totals.netMargin = totals.totalIncome - totals.totalExpense;
  return totals;
}

/**
 * All-time figures per currency.
 *
 * Amounts are kept separate per currency rather than converted: the system
 * stores no exchange rate, so summing UZS and USD would produce a number that
 * means nothing.
 */
export async function getSummary(
  companyId: CompanyFilter = null
): Promise<Record<Currency, CurrencyTotals>> {
  "use cache";
  cacheTag(REPORTS_TAG);
  cacheLife("hours");

  const [txGroups, credits] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["source", "type", "currency"],
      where: scope(companyId),
      _sum: { amount: true },
    }),
    prisma.credit.findMany({
      where: { isDeleted: false, ...(companyId ? { companyId } : {}) },
      select: {
        currency: true,
        payments: {
          where: { isDeleted: false },
          select: { amount: true, isPaid: true },
        },
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

  // Reported for the credit card only. `creditPaid` deliberately stays out of
  // the margin: see `derive`.
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
  /** Already translated for display; grouping happens on the canonical name. */
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
export async function getExpenseBreakdown(
  companyId: CompanyFilter = null
): Promise<Record<Currency, CategorySlice[]>> {
  "use cache";
  cacheTag(REPORTS_TAG);
  cacheLife("hours");

  const groups = await prisma.transaction.groupBy({
    by: ["currency", "source", "category"],
    where: { ...scope(companyId), type: "EXPENSE" },
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

      const folded =
        slices.length <= CATEGORY_SLOTS + 1
          ? slices
          : [
              ...slices.slice(0, CATEGORY_SLOTS),
              {
                category: "Other",
                amount: slices
                  .slice(CATEGORY_SLOTS)
                  .reduce((total, slice) => total + slice.amount, 0),
              },
            ];

      // Translate last, so folding and grouping stay keyed on the canonical
      // name the bot stored.
      return [
        currency,
        folded.map((slice) => ({
          ...slice,
          category: categoryLabel(Locale.RU, slice.category),
        })),
      ];
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
  /** Credit instalments settled that month, already part of `expense`. */
  creditPaid: number;
  margin: number;
}

/**
 * Income / expense / margin for each of the last `months` months, per currency.
 * Aggregated in JS because the row counts here are small and it keeps the
 * month bucketing free of database timezone surprises.
 */
export async function getMonthlySeries(
  months = 12,
  companyId: CompanyFilter = null
): Promise<Record<Currency, MonthPoint[]>> {
  "use cache";
  cacheTag(REPORTS_TAG);
  cacheLife("hours");

  const from = startOfMonth(subMonths(new Date(), months - 1));

  const [transactions, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...scope(companyId), date: { gte: from } },
      select: { date: true, type: true, amount: true, currency: true },
    }),
    prisma.creditPayment.findMany({
      where: {
        isDeleted: false,
        isPaid: true,
        paidDate: { gte: from },
        credit: { isDeleted: false, ...(companyId ? { companyId } : {}) },
      },
      select: { paidDate: true, amount: true, credit: { select: { currency: true } } },
    }),
  ]);

  const buckets = Object.fromEntries(
    CURRENCIES.map((currency) => {
      const points = Array.from({ length: months }, (_, index) => {
        const date = startOfMonth(subMonths(new Date(), months - 1 - index));
        return {
          month: format(date, "yyyy-MM"),
          // The dashboard is the only consumer of this series, and it renders
          // in Russian.
          label: format(date, "LLL yyyy", { locale: ru }),
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

  // Shown as its own line on the chart; not added to `expense`, which already
  // contains the auto-posted repayment.
  for (const payment of payments) {
    const point = findPoint(payment.credit.currency, payment.paidDate!);
    if (!point) continue;
    point.creditPaid += toNumber(payment.amount);
  }

  for (const currency of CURRENCIES) {
    for (const point of buckets[currency]) {
      point.margin = point.income - point.expense;
    }
  }

  return buckets;
}

/** The companies the dashboard filter offers. */
export async function getCompanies() {
  "use cache";
  cacheTag(REPORTS_TAG);
  cacheLife("hours");

  return prisma.company.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
