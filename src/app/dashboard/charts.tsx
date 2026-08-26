"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Currency } from "@prisma/client";
import { formatCompact, formatMoney } from "@/lib/money";
import type { CategorySlice, MonthPoint } from "@/lib/reporting";

/** The validated categorical slots, referenced by role rather than raw hex. */
const SERIES = {
  income: "var(--series-1)",
  expense: "var(--series-2)",
  positive: "var(--diverge-pos)",
  negative: "var(--diverge-neg)",
} as const;

const SLICE_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--ink-muted)", fontSize: 12 },
  tickLine: false,
} as const;

// ---------- Shared chrome ----------

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-[var(--ink-muted)]">
      {label}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ background: color }}
    />
  );
}

interface TooltipRow {
  label: string;
  value: number;
  color: string;
}

function TooltipCard({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: TooltipRow[];
  currency: Currency;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-[var(--ink)]">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <Swatch color={row.color} />
            <span className="text-[var(--ink-secondary)]">{row.label}</span>
            <span className="tnum ml-auto pl-4 font-medium text-[var(--ink)]">
              {formatMoney(row.value, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Income vs expense, by month ----------

export function IncomeExpenseChart({
  data,
  currency,
}: {
  data: MonthPoint[];
  currency: Currency;
}) {
  const hasData = data.some((point) => point.income > 0 || point.expense > 0);

  return (
    <Panel
      title="Приход и расход по месяцам"
      hint="Касса и банк вместе."
    >
      {/* Legend sits above the plot so identity is never carried by colour alone. */}
      <ul className="mb-3 flex items-center gap-4 text-xs text-[var(--ink-secondary)]">
        <li className="flex items-center gap-1.5">
          <Swatch color={SERIES.income} /> Приход
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch color={SERIES.expense} /> Расход
        </li>
      </ul>

      {hasData ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: "var(--axis)" }} />
            <YAxis
              {...axisProps}
              axisLine={false}
              width={52}
              tickFormatter={formatCompact}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-sunken)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={String(label)}
                    currency={currency}
                    rows={[
                      {
                        label: "Приход",
                        value: Number(payload[0]?.payload.income ?? 0),
                        color: SERIES.income,
                      },
                      {
                        label: "Расход",
                        value: Number(payload[0]?.payload.expense ?? 0),
                        color: SERIES.expense,
                      },
                    ]}
                  />
                ) : null
              }
            />
            {/* 2px gap between adjacent fills, no borders on the marks. */}
            <Bar dataKey="income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="expense" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Empty label={`Операций в ${currency} за последние 12 месяцев нет.`} />
      )}
    </Panel>
  );
}

// ---------- Net margin, by month ----------

export function MarginChart({
  data,
  currency,
}: {
  data: MonthPoint[];
  currency: Currency;
}) {
  const hasData = data.some((point) => point.margin !== 0);

  return (
    <Panel
      title="Чистая маржа по месяцам"
      hint="Приход − (расход + оплаченные платежи по кредитам)."
    >
      <ul className="mb-3 flex items-center gap-4 text-xs text-[var(--ink-secondary)]">
        <li className="flex items-center gap-1.5">
          <Swatch color={SERIES.positive} /> Прибыль
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch color={SERIES.negative} /> Убыток
        </li>
      </ul>

      {hasData ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: "var(--axis)" }} />
            <YAxis
              {...axisProps}
              axisLine={false}
              width={52}
              tickFormatter={formatCompact}
            />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ fill: "var(--surface-sunken)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as MonthPoint;
                return (
                  <TooltipCard
                    title={String(label)}
                    currency={currency}
                    rows={[
                      { label: "Приход", value: point.income, color: SERIES.income },
                      { label: "Расход", value: point.expense, color: SERIES.expense },
                      {
                        label: "Оплачено по кредитам",
                        value: point.creditPaid,
                        color: "var(--series-4)",
                      },
                      {
                        label: "Маржа",
                        value: point.margin,
                        color: point.margin >= 0 ? SERIES.positive : SERIES.negative,
                      },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="margin" radius={4} maxBarSize={26}>
              {data.map((point) => (
                <Cell
                  key={point.month}
                  fill={point.margin >= 0 ? SERIES.positive : SERIES.negative}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Empty label={`Движений в ${currency} за последние 12 месяцев нет.`} />
      )}
    </Panel>
  );
}

// ---------- Expense breakdown ----------

export function ExpenseBreakdownChart({
  data,
  currency,
}: {
  data: CategorySlice[];
  currency: Currency;
}) {
  const total = data.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <Panel title="Структура расходов" hint="Все расходы за всё время, по категориям.">
      {total > 0 ? (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ResponsiveContainer width="100%" height={200} className="max-w-[200px]">
            <PieChart>
              <Pie
                data={data}
                dataKey="amount"
                nameKey="category"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {data.map((slice, index) => (
                  <Cell
                    key={slice.category}
                    fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      title={String(payload[0].name)}
                      currency={currency}
                      rows={[
                        {
                          label: `${((Number(payload[0].value) / total) * 100).toFixed(1)}% расходов`,
                          value: Number(payload[0].value),
                          color: SLICE_COLORS[
                            data.findIndex((s) => s.category === payload[0].name) %
                              SLICE_COLORS.length
                          ],
                        },
                      ]}
                    />
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>

          {/*
           * Three light-mode slots fall below 3:1 against the surface, so the
           * validated palette requires relief: every slice is spelled out here
           * with its value, in ink tokens rather than the series colour.
           */}
          <ul className="flex w-full flex-1 flex-col gap-1 text-sm">
            {data.map((slice, index) => (
              <li key={slice.category} className="flex items-center gap-2 py-1">
                <Swatch color={SLICE_COLORS[index % SLICE_COLORS.length]} />
                <span className="truncate text-[var(--ink-secondary)]">
                  {slice.category}
                </span>
                <span className="tnum ml-auto pl-3 font-medium">
                  {formatMoney(slice.amount, currency)}
                </span>
                <span className="tnum w-12 text-right text-xs text-[var(--ink-muted)]">
                  {((slice.amount / total) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Empty label={`Расходов в ${currency} пока нет.`} />
      )}
    </Panel>
  );
}
