import { redirect } from "next/navigation";
import { format } from "date-fns";
import { hasSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getExpenseBreakdown,
  getMonthlySeries,
  getSummary,
} from "@/lib/reporting";
import { logout } from "@/app/actions/auth";
import { Overview } from "./overview";

// Figures must reflect what the bot wrote a moment ago, never a cached page.
export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard · Mariyam" };

const LOG_LIMIT = 25;

export default async function DashboardPage() {
  // The proxy already redirected anonymous visitors; this is the check that
  // actually enforces access, since a route handler can be reached directly.
  if (!(await hasSession())) redirect("/login");

  const [summary, series, breakdown, logs] = await Promise.all([
    getSummary(),
    getMonthlySeries(12),
    getExpenseBreakdown(),
    prisma.actionLog.findMany({
      orderBy: { timestamp: "desc" },
      take: LOG_LIMIT,
      include: { user: { select: { name: true, role: true, telegramId: true } } },
    }),
  ]);

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
                Financial accounting
              </h1>
              <p className="text-xs text-[var(--ink-muted)]">
                {format(new Date(), "d MMMM yyyy, HH:mm")}
              </p>
            </div>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Overview data={{ summary, series, breakdown }} />

        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <header className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Action log</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              The last {LOG_LIMIT} actions recorded by the bot and this dashboard.
            </p>
          </header>

          {logs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
              Nothing has been recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-[var(--ink-muted)]">
                    <th className="px-5 py-2.5 font-medium">When</th>
                    <th className="px-5 py-2.5 font-medium">Who</th>
                    <th className="px-5 py-2.5 font-medium">Action</th>
                    <th className="px-5 py-2.5 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-t border-[var(--line)] align-top"
                    >
                      <td className="tnum whitespace-nowrap px-5 py-3 text-[var(--ink-secondary)]">
                        {format(log.timestamp, "dd.MM.yyyy HH:mm")}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {log.user ? (
                          <>
                            <span className="font-medium">{log.user.name}</span>
                            <span className="ml-1.5 text-xs text-[var(--ink-muted)]">
                              {log.user.role} · {log.user.telegramId.toString()}
                            </span>
                          </>
                        ) : (
                          <span className="text-[var(--ink-muted)]">system</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs">
                          {log.action}
                        </code>
                      </td>
                      <td className="px-5 py-3 text-[var(--ink-secondary)]">
                        {log.details ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
