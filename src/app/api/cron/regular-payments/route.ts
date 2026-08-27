import { Prisma, TxOrigin, TxType } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cronSecret } from "@/lib/env";
import { REPORTS_TAG } from "@/lib/reporting";

// Cache Components makes every route Node.js and dynamic by default, so the
// only thing left to declare is how long a slow run may take.
export const maxDuration = 60;

/**
 * The books are kept in Tashkent time. The cron fires on UTC, so "today" is
 * resolved in the business timezone rather than the server's — otherwise a
 * payment due on the 1st would post on the 31st for part of the day.
 */
const BUSINESS_TZ = "Asia/Tashkent";

/** `{ ymd: "2026-08-27", day: 27, isLastDayOfMonth: false }` in Tashkent time. */
function businessToday(now: Date) {
  // "en-CA" formats as YYYY-MM-DD, which sorts and parses cleanly.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, month, day] = ymd.split("-").map(Number);
  // Day 0 of the following month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    ymd,
    year,
    month,
    day,
    periodKey: ymd.slice(0, 7),
    isLastDayOfMonth: day === daysInMonth,
  };
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}

/** Vercel Cron issues a GET; POST is kept for manual triggering. */
export async function GET(request: Request): Promise<Response> {
  return run(request);
}

async function run(request: Request): Promise<Response> {
  const expected = `Bearer ${cronSecret()}`;
  if (request.headers.get("authorization") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = businessToday(now);

  // A payment is due today when its day matches, or when the month is too
  // short to contain its day and today is that month's last day.
  const due = await prisma.regularPayment.findMany({
    where: {
      isDeleted: false,
      OR: [
        { dayOfMonth: today.day },
        ...(today.isLastDayOfMonth ? [{ dayOfMonth: { gt: today.day } }] : []),
      ],
    },
    include: { company: { select: { name: true } } },
  });

  // Booked at midday so the posting cannot slip into an adjacent month when
  // the date is later read back in a different timezone.
  const date = new Date(`${today.ymd}T12:00:00.000Z`);

  const posted: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const payment of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const expense = await tx.transaction.create({
          data: {
            type: TxType.EXPENSE,
            source: payment.source,
            amount: payment.amount,
            currency: payment.currency,
            category: payment.category ?? "Regular payment",
            comment: payment.name,
            date,
            origin: TxOrigin.REGULAR_PAYMENT,
            regularPaymentId: payment.id,
            periodKey: today.periodKey,
            companyId: payment.companyId,
            // No human authored this one.
            userId: null,
          },
        });

        await tx.actionLog.create({
          data: {
            userId: null,
            action: "REGULAR_PAYMENT_POSTED",
            details: `${payment.name} · ${payment.amount.toString()} ${payment.currency} · ${payment.source}`,
            companyId: payment.companyId,
          },
        });

        return expense;
      });

      posted.push(payment.id);
    } catch (error) {
      // `@@unique([regularPaymentId, periodKey])` means this month's expense is
      // already on the books. Vercel retries a failed cron, and a retry must
      // not double-charge, so a clash is the expected success path.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skipped.push(payment.id);
        continue;
      }

      // One bad row must not strand the rest of the day's payments.
      const message = error instanceof Error ? error.message : String(error);
      console.error("[cron/regular-payments] failed", payment.id, message);
      failed.push({ id: payment.id, error: message });
    }
  }

  if (posted.length > 0) revalidateTag(REPORTS_TAG, "max");

  return Response.json({
    ok: failed.length === 0,
    date: today.ymd,
    period: today.periodKey,
    due: due.length,
    posted: posted.length,
    skipped: skipped.length,
    failed,
  });
}
