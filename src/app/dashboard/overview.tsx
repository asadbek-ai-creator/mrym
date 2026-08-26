"use client";

import { useState } from "react";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import type { CategorySlice, CurrencyTotals, MonthPoint } from "@/lib/reporting";
import {
  ExpenseBreakdownChart,
  IncomeExpenseChart,
  MarginChart,
} from "./charts";

export interface OverviewData {
  summary: Record<Currency, CurrencyTotals>;
  series: Record<Currency, MonthPoint[]>;
  breakdown: Record<Currency, CategorySlice[]>;
}

const CURRENCIES: Currency[] = ["UZS", "USD"];

/**
 * Amounts are never converted between currencies — the system stores no
 * exchange rate — so the whole view is scoped to one currency at a time.
 */
export function Overview({ data }: { data: OverviewData }) {
  const [currency, setCurrency] = useState<Currency>("UZS");

  const totals = data.summary[currency];
  const series = data.series[currency];
  const breakdown = data.breakdown[currency];

  return (
    <div className="flex flex-col gap-6">
      {/* One filter row above everything it scopes. */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
          Overview
        </h2>
        <div
          role="group"
          aria-label="Currency"
          className="flex rounded-lg border border-[var(--line)] bg-[var(--surface)] p-0.5"
        >
          {CURRENCIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCurrency(option)}
              aria-pressed={currency === option}
              className={`rounded-[6px] px-3 py-1.5 text-xs font-medium transition ${
                currency === option
                  ? "bg-[var(--ink)] text-[var(--surface)]"
                  : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <MarginHero totals={totals} currency={currency} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Cash balance"
          value={formatMoney(totals.cashBalance, currency)}
          detail={`In ${formatMoney(totals.cashIncome, currency)} · out ${formatMoney(totals.cashExpense, currency)}`}
        />
        <StatTile
          label="Bank balance"
          value={formatMoney(totals.bankBalance, currency)}
          detail={`In ${formatMoney(totals.bankIncome, currency)} · out ${formatMoney(totals.bankExpense, currency)}`}
        />
        <StatTile
          label="Credits pending"
          value={formatMoney(totals.creditPending, currency)}
          detail={`Paid so far ${formatMoney(totals.creditPaid, currency)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <IncomeExpenseChart data={series} currency={currency} />
        <MarginChart data={series} currency={currency} />
      </div>

      <ExpenseBreakdownChart data={breakdown} currency={currency} />
    </div>
  );
}

/** The one number the dashboard leads with, plus the formula behind it. */
function MarginHero({
  totals,
  currency,
}: {
  totals: CurrencyTotals;
  currency: Currency;
}) {
  const positive = totals.netMargin >= 0;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
        Net margin
      </p>

      <p
        className="mt-2 text-[clamp(2.25rem,6vw,3.25rem)] font-semibold leading-none tracking-tight"
        style={{ color: positive ? "var(--good)" : "var(--critical)" }}
      >
        {positive ? "" : "−"}
        {formatMoney(Math.abs(totals.netMargin), currency)}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--ink-secondary)]">
        <Term value={formatMoney(totals.totalIncome, currency)} label="income" />
        <span aria-hidden className="text-[var(--ink-muted)]">−</span>
        <Term value={formatMoney(totals.totalExpense, currency)} label="expense" />
        <span aria-hidden className="text-[var(--ink-muted)]">−</span>
        <Term value={formatMoney(totals.creditPaid, currency)} label="credits paid" />
      </p>
    </section>
  );
}

function Term({ value, label }: { value: string; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="tnum font-medium text-[var(--ink)]">{value}</span>{" "}
      <span className="text-[var(--ink-muted)]">{label}</span>
    </span>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1.5 text-xs text-[var(--ink-secondary)]">{detail}</p>
    </div>
  );
}
