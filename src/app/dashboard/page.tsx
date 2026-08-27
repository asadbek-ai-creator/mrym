import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Locale } from "@prisma/client";
import { hasSession } from "@/lib/auth";
import { roleLabel } from "@/lib/bot/i18n";
import { prisma } from "@/lib/prisma";
import {
  getCompanies,
  getExpenseBreakdown,
  getMonthlySeries,
  getSummary,
  type CompanyFilter,
} from "@/lib/reporting";
import { logout } from "@/app/actions/auth";
import { Overview } from "./overview";

export const metadata = { title: "Панель · Mariyam" };

const LOG_LIMIT = 25;

/**
 * Human wording for the action codes the bot writes.
 *
 * The stored code stays canonical so the audit trail is searchable and does
 * not depend on anyone's language; only the display is translated. An action
 * with no entry here falls back to its raw code rather than disappearing.
 */
const ACTION_LABELS: Record<string, string> = {
  BOT_START: "Запуск бота",
  ACCESS_REQUESTED: "Запрошен доступ",
  ACCESS_GRANTED: "Доступ предоставлен",
  ACCESS_DECLINED: "В доступе отказано",
  CASH_INCOME_CREATED: "Приход по кассе",
  CASH_EXPENSE_CREATED: "Расход по кассе",
  BANK_INCOME_CREATED: "Приход по банку",
  BANK_EXPENSE_CREATED: "Расход по банку",
  CREDIT_CREATED: "Кредит создан",
  CREDIT_PAYMENT_PAID: "Платёж по кредиту оплачен",
  TRANSACTION_AMOUNT_EDITED: "Сумма изменена",
  TRANSACTION_COMMENT_EDITED: "Комментарий изменён",
  TRANSACTION_DELETED: "Запись удалена",
  COMPANY_CREATED: "Компания добавлена",
  REGULAR_PAYMENT_CREATED: "Регулярный платёж создан",
  REGULAR_PAYMENT_POSTED: "Регулярный платёж проведён",
  REGULAR_PAYMENT_STOPPED: "Регулярный платёж остановлен",
  USER_UPSERTED: "Пользователь добавлен или изменён",
  USER_DELETED: "Пользователь удалён",
  USER_ACCESS_REVOKED: "Доступ отозван",
  EXPORT_XLSX: "Экспорт в Excel",
  LANGUAGE_CHANGED: "Язык изменён",
  DASHBOARD_LOGIN: "Вход в панель",
  DASHBOARD_LOGIN_FAILED: "Неудачный вход в панель",
};

/**
 * Actions that removed something from the books. Nothing is hard-deleted any
 * more, so the log is the only place a soft delete becomes visible — these
 * rows are struck through and shown in red.
 */
const SOFT_DELETE_ACTIONS = new Set([
  "TRANSACTION_DELETED",
  "REGULAR_PAYMENT_STOPPED",
  "USER_ACCESS_REVOKED",
]);

/**
 * The shell prerenders; everything that depends on the session, the URL or the
 * database streams in behind a boundary. That is what Cache Components asks
 * for, and it means the page paints immediately instead of waiting on Postgres.
 */
export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ink)] text-sm text-[var(--surface)]">
              ₮
            </span>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">
                Финансовый учёт
              </h1>
              <Suspense fallback={<span className="block h-4" />}>
                <Today />
              </Suspense>
            </div>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)]"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Suspense fallback={<BodySkeleton />}>
          <DashboardBody searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

/**
 * Guards the page and resolves the company filter.
 *
 * The proxy already redirected anonymous visitors; this is the check that
 * actually enforces access, since a route can be reached directly.
 */
async function DashboardBody({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  if (!(await hasSession())) redirect("/login");

  const selected = (await searchParams).company ?? null;

  return (
    <>
      <CompanyFilterBar selected={selected} />
      <Suspense fallback={<OverviewSkeleton />}>
        <Reports companyId={selected} />
      </Suspense>
      <Suspense fallback={<LogSkeleton />}>
        <ActionLog companyId={selected} />
      </Suspense>
    </>
  );
}

/** Reads the clock, so it renders at request time rather than at build time. */
async function Today() {
  await connection();
  return (
    <p className="text-xs text-[var(--ink-muted)]">
      {format(new Date(), "d MMMM yyyy", { locale: ru })}
    </p>
  );
}

/**
 * Aggregate across every company, or isolate one.
 *
 * Plain links rather than a client-side control: the selection belongs in the
 * URL so a filtered view can be shared and bookmarked, and each choice gets
 * its own cache entry on the server.
 */
async function CompanyFilterBar({ selected }: { selected: CompanyFilter }) {
  const companies = await getCompanies();
  if (companies.length === 0) return null;

  const options = [{ id: null as CompanyFilter, name: "Все компании" }, ...companies];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
        Компания
      </span>
      {options.map((option) => {
        const active = option.id === selected;
        return (
          <Link
            key={option.id ?? "all"}
            href={option.id ? `/dashboard?company=${option.id}` : "/dashboard"}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--surface)]"
                : "rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)]"
            }
          >
            {option.name}
          </Link>
        );
      })}
    </div>
  );
}

/** The cached figures. Every query is scoped to the selected company. */
async function Reports({ companyId }: { companyId: CompanyFilter }) {
  const [summary, series, breakdown] = await Promise.all([
    getSummary(companyId),
    getMonthlySeries(12, companyId),
    getExpenseBreakdown(companyId),
  ]);

  return <Overview data={{ summary, series, breakdown }} />;
}

async function ActionLog({ companyId }: { companyId: CompanyFilter }) {
  const logs = await prisma.actionLog.findMany({
    // Account-level actions carry no company, so they stay visible under
    // every filter rather than vanishing when one is picked.
    where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
    orderBy: { timestamp: "desc" },
    take: LOG_LIMIT,
    include: {
      user: { select: { name: true, role: true, telegramId: true } },
      company: { select: { name: true } },
    },
  });

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <header className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Журнал действий</h2>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
          Последние {LOG_LIMIT} действий. Удалённые записи показаны зачёркнутыми —
          ничего не удаляется из базы безвозвратно.
        </p>
      </header>

      {logs.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
          Записей пока нет.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--ink-muted)]">
                <th className="px-5 py-2.5 font-medium">Когда</th>
                <th className="px-5 py-2.5 font-medium">Компания</th>
                <th className="px-5 py-2.5 font-medium">Кто</th>
                <th className="px-5 py-2.5 font-medium">Действие</th>
                <th className="px-5 py-2.5 font-medium">Детали</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const removed = SOFT_DELETE_ACTIONS.has(log.action);
                return (
                  <tr
                    key={log.id}
                    className={
                      removed
                        ? "border-t border-[var(--line)] bg-red-500/5 align-top text-red-600 dark:text-red-400"
                        : "border-t border-[var(--line)] align-top"
                    }
                  >
                    <td className="tnum whitespace-nowrap px-5 py-3 text-[var(--ink-secondary)]">
                      {format(log.timestamp, "dd.MM.yyyy HH:mm")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[var(--ink-secondary)]">
                      {log.company?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {log.user ? (
                        <>
                          <span className="font-medium">{log.user.name}</span>
                          <span className="ml-1.5 text-xs text-[var(--ink-muted)]">
                            {roleLabel(Locale.RU, log.user.role)} ·{" "}
                            {log.user.telegramId.toString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--ink-muted)]">система</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {/* The raw code stays reachable on hover for auditing. */}
                      <span title={log.action}>
                        {ACTION_LABELS[log.action] ?? (
                          <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs">
                            {log.action}
                          </code>
                        )}
                      </span>
                    </td>
                    <td
                      className={
                        removed
                          ? "px-5 py-3 line-through decoration-red-500/60"
                          : "px-5 py-3 text-[var(--ink-secondary)]"
                      }
                    >
                      {log.details ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Streaming placeholders ----------

function BodySkeleton() {
  return (
    <>
      <div className="mb-6 h-8 w-72 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
      <OverviewSkeleton />
      <LogSkeleton />
    </>
  );
}

function OverviewSkeleton() {
  return <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />;
}

function LogSkeleton() {
  return <div className="mt-6 h-64 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />;
}
