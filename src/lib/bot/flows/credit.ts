import { Composer, InlineKeyboard } from "grammy";
import {
  CreditStatus,
  Prisma,
  TxOrigin,
  TxSource,
  TxType,
  type Credit,
  type Currency,
} from "@prisma/client";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount, toNumber } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import { cancelMenu, mainMenu, sourceKeyboard } from "../keyboards";
import { labels } from "../i18n";
import { onePerRow, onStep, resetSession } from "../helpers";
import { requireActiveStore, storeLine } from "../stores";
import { esc, fmtDate } from "../format";
import type { BotContext } from "../types";

/**
 * Credit wizard: bank name → monthly instalment → months → account, all filed
 * against the user's active store.
 *
 * The schedule is generated from the instalment and the term, which is how a
 * bank actually quotes a credit, so the residual is always instalment × months
 * remaining rather than a figure derived back out of a total.
 */
export const creditFlow = new Composer<BotContext>();

/** How many unpaid instalments are offered as buttons at once. */
const VISIBLE_PAYMENTS = 12;

/** The category every automatic credit expense is filed under. */
export const CREDIT_CATEGORY = "Credit payment";

/**
 * The repayment schedule: `months` equal instalments, one per month, starting
 * a month after `from`. Each instalment is the quoted amount exactly, so the
 * residual never drifts by rounding.
 */
export function buildSchedule(monthly: number, months: number, from: Date) {
  return Array.from({ length: months }, (_, index) => ({
    amount: monthly,
    dueDate: addMonths(from, index + 1),
  }));
}

// ---------- Creating a credit ----------

creditFlow.hears(
  labels("btn.addCredit"),
  requireModule("CREDIT"),
  requireActiveStore,
  async (ctx) => {
    ctx.session.step = "credit:bank";
    ctx.session.draft = { companyId: ctx.activeCompany!.id };
    await ctx.reply([storeLine(ctx), "", ctx.t("credit.new")].join("\n"), {
      parse_mode: "HTML",
      reply_markup: cancelMenu(ctx.locale),
    });
  }
);

onStep(creditFlow, "credit:bank", async (ctx) => {
  ctx.session.draft.bankName = ctx.message!.text!.trim();
  ctx.session.step = "credit:monthly";
  await ctx.reply(ctx.t("credit.askMonthly"), {
    parse_mode: "HTML",
    reply_markup: cancelMenu(ctx.locale),
  });
});

onStep(creditFlow, "credit:monthly", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply(ctx.t("common.badAmount", { example: "5000000" }));
    return;
  }
  ctx.session.draft.monthlyAmount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "credit:duration";
  await ctx.reply(
    ctx.t("credit.askDuration", {
      amount: formatMoney(parsed.amount, parsed.currency),
    }),
    { parse_mode: "HTML", reply_markup: cancelMenu(ctx.locale) }
  );
});

onStep(creditFlow, "credit:duration", async (ctx) => {
  const months = Number(ctx.message!.text!.trim());
  if (!Number.isInteger(months) || months < 1 || months > 360) {
    await ctx.reply(ctx.t("credit.badDuration"));
    return;
  }

  ctx.session.draft.duration = months;
  ctx.session.step = "credit:source";
  await ctx.reply(ctx.t("credit.askSource"), {
    parse_mode: "HTML",
    reply_markup: sourceKeyboard("creditsrc", ctx.locale),
  });
});

creditFlow.callbackQuery(
  /^creditsrc:(CASH|BANK)$/,
  requireModule("CREDIT"),
  async (ctx) => {
    if (ctx.session.step !== "credit:source") {
      await ctx.answerCallbackQuery(ctx.t("common.stepExpired"));
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await saveCredit(ctx, ctx.match![1] as TxSource);
  }
);

async function saveCredit(ctx: BotContext, source: TxSource) {
  const draft = ctx.session.draft;
  const monthly = draft.monthlyAmount as number;
  const months = draft.duration as number;
  const currency = draft.currency as Currency;
  const schedule = buildSchedule(monthly, months, new Date());
  const total = Math.round(monthly * months * 100) / 100;

  const credit = await prisma.credit.create({
    data: {
      bankName: draft.bankName as string,
      monthlyAmount: monthly,
      totalAmount: total,
      currency,
      duration: months,
      source,
      companyId: draft.companyId as string,
      userId: ctx.user.id,
      payments: { create: schedule },
    },
  });

  await logAction(
    ctx.user.id,
    "CREDIT_CREATED",
    `${esc(credit.bankName)} · ${formatMoney(monthly, currency)} × ${months} = ${formatMoney(total, currency)}`,
    credit.companyId
  );

  resetSession(ctx);
  await ctx.reply(
    ctx.t("credit.created", {
      bank: esc(credit.bankName),
      total: formatMoney(total, currency),
      months,
      monthly: formatMoney(monthly, currency),
      due: fmtDate(schedule[0].dueDate),
    }),
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(
        ctx.t("credit.openSchedule"),
        `credit:${credit.id}`
      ),
    }
  );
  await ctx.reply(ctx.t("common.next"), {
    reply_markup: mainMenu(ctx.role, ctx.locale),
  });
}

// ---------- Browsing credits ----------

creditFlow.hears(
  labels("btn.credits"),
  requireModule("CREDIT"),
  requireActiveStore,
  async (ctx) => {
    const credits = await prisma.credit.findMany({
      // Strict isolation: only the store currently open.
      where: { isDeleted: false, companyId: ctx.activeCompany!.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
      include: {
        payments: { where: { isDeleted: false }, select: { isPaid: true } },
      },
    });

    if (credits.length === 0) {
      await ctx.reply(ctx.t("credit.none"));
      return;
    }

    const kb = new InlineKeyboard();
    const addRow = onePerRow(kb);
    for (const credit of credits) {
      const paid = credit.payments.filter((p) => p.isPaid).length;
      const mark = credit.status === CreditStatus.CLOSED ? "✅" : "💳";
      addRow(
        `${mark} ${credit.bankName} · ${paid}/${credit.payments.length}`,
        `credit:${credit.id}`
      );
    }

    await ctx.reply(
      [storeLine(ctx), "", ctx.t("credit.list")].join("\n"),
      { parse_mode: "HTML", reply_markup: kb }
    );
  }
);

/** Renders a credit with its outstanding instalments as tappable buttons. */
async function renderCredit(ctx: BotContext, creditId: string, edit: boolean) {
  const credit = await prisma.credit.findUnique({
    where: { id: creditId },
    include: {
      company: { select: { name: true } },
      payments: { where: { isDeleted: false }, orderBy: { dueDate: "asc" } },
    },
  });

  if (!credit || credit.isDeleted) {
    await ctx.answerCallbackQuery(ctx.t("credit.notFound"));
    return;
  }
  // A keyboard from an earlier store can still be on screen; refuse it rather
  // than rendering another store's books.
  if (credit.companyId !== ctx.activeCompany?.id) {
    await ctx.answerCallbackQuery({
      text: ctx.t("store.noAccess"),
      show_alert: true,
    });
    return;
  }

  const paid = credit.payments.filter((p) => p.isPaid);
  const unpaid = credit.payments.filter((p) => !p.isPaid);
  const paidSum = paid.reduce((sum, p) => sum + toNumber(p.amount), 0);
  const total = toNumber(credit.totalAmount);

  const text = [
    `💳 <b>${esc(credit.bankName)}</b>`,
    ctx.t("company.chosen", { name: esc(credit.company.name) }),
    ctx.t("credit.cardTotal", { total: formatMoney(total, credit.currency) }),
    ctx.t("credit.cardMonthly", {
      monthly: formatMoney(toNumber(credit.monthlyAmount), credit.currency),
    }),
    ctx.t("credit.cardDuration", { months: credit.duration }),
    ctx.t("credit.cardPaid", {
      paid: formatMoney(paidSum, credit.currency),
      count: paid.length,
      total: credit.payments.length,
    }),
    // The residual: every instalment not yet marked paid.
    ctx.t("credit.cardRemaining", {
      remaining: formatMoney(total - paidSum, credit.currency),
    }),
    ctx.t("credit.cardStatus", {
      status: ctx.t(
        credit.status === CreditStatus.CLOSED
          ? "credit.statusClosed"
          : "credit.statusActive"
      ),
    }),
    "",
    unpaid.length ? ctx.t("credit.tapInstalment") : ctx.t("credit.allPaid"),
  ].join("\n");

  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const payment of unpaid.slice(0, VISIBLE_PAYMENTS)) {
    const overdue = payment.dueDate < new Date() ? "⚠️ " : "";
    addRow(
      `${overdue}${fmtDate(payment.dueDate)} · ${formatMoney(toNumber(payment.amount), credit.currency)}`,
      `pay:${payment.id}`
    );
  }
  if (unpaid.length > VISIBLE_PAYMENTS) {
    addRow(
      ctx.t("credit.moreInstalments", { count: unpaid.length - VISIBLE_PAYMENTS }),
      "noop"
    );
  }

  const options = { parse_mode: "HTML" as const, reply_markup: kb };
  if (edit) {
    await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
  } else {
    await ctx.reply(text, options);
  }
}

creditFlow.callbackQuery(
  /^credit:(.+)$/,
  requireModule("CREDIT"),
  requireActiveStore,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderCredit(ctx, ctx.match![1], true);
  }
);

creditFlow.callbackQuery("noop", (ctx) =>
  ctx.answerCallbackQuery(ctx.t("credit.payEarlierFirst"))
);

// ---------- Marking an instalment as paid ----------

/**
 * Marks an instalment paid and posts the matching expense in one transaction.
 *
 * A repayment is money leaving an account, so it has to reach the books as an
 * ordinary EXPENSE or it would never touch the balance or the net margin. The
 * two writes are atomic, the update is conditional on the instalment still
 * being unpaid, and `creditPaymentId` is unique — so a double tap can neither
 * post the expense twice nor mark an instalment paid without its expense.
 */
export async function payInstalment(
  paymentId: string,
  userId: string,
  credit: Credit,
  amount: number,
  dueDate: Date
) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.creditPayment.updateMany({
      where: { id: paymentId, isPaid: false, isDeleted: false },
      data: { isPaid: true, paidDate: new Date() },
    });
    // Someone else got there first; their expense is already posted.
    if (claimed.count === 0) return null;

    const expense = await tx.transaction.create({
      data: {
        type: TxType.EXPENSE,
        source: credit.source,
        amount,
        currency: credit.currency,
        category: CREDIT_CATEGORY,
        comment: `${credit.bankName} · ${fmtDate(dueDate)}`,
        bankName: credit.source === TxSource.BANK ? credit.bankName : null,
        origin: TxOrigin.CREDIT_PAYMENT,
        creditPaymentId: paymentId,
        companyId: credit.companyId,
        userId,
      },
    });

    // Close the credit once nothing is outstanding.
    const remaining = await tx.creditPayment.count({
      where: { creditId: credit.id, isPaid: false, isDeleted: false },
    });
    if (remaining === 0) {
      await tx.credit.update({
        where: { id: credit.id },
        data: { status: CreditStatus.CLOSED },
      });
    }

    return expense;
  });
}

creditFlow.callbackQuery(
  /^pay:(.+)$/,
  requireModule("CREDIT"),
  requireActiveStore,
  async (ctx) => {
    const paymentId = ctx.match![1];
    const payment = await prisma.creditPayment.findUnique({
      where: { id: paymentId },
      include: { credit: { include: { company: { select: { name: true } } } } },
    });

    if (!payment || payment.isDeleted) {
      await ctx.answerCallbackQuery(ctx.t("credit.instalmentNotFound"));
      return;
    }
    // The expense this posts lands in the credit's store, so the user must be
    // standing in that store to trigger it.
    if (payment.credit.companyId !== ctx.activeCompany?.id) {
      await ctx.answerCallbackQuery({
        text: ctx.t("store.noAccess"),
        show_alert: true,
      });
      return;
    }
    if (payment.isPaid) {
      await ctx.answerCallbackQuery(ctx.t("credit.alreadyPaid"));
      return;
    }

    const amount = toNumber(payment.amount);
    let expense;
    try {
      expense = await payInstalment(
        paymentId,
        ctx.user.id,
        payment.credit,
        amount,
        payment.dueDate
      );
    } catch (error) {
      // The unique on `creditPaymentId` fired: the expense already exists.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await ctx.answerCallbackQuery(ctx.t("credit.alreadyPaid"));
        return;
      }
      throw error;
    }

    if (!expense) {
      await ctx.answerCallbackQuery(ctx.t("credit.alreadyPaid"));
      return;
    }

    const money = formatMoney(amount, payment.credit.currency);
    await logAction(
      ctx.user.id,
      "CREDIT_PAYMENT_PAID",
      `${esc(payment.credit.bankName)} · ${money} · due ${fmtDate(payment.dueDate)} · expense posted`,
      payment.credit.companyId
    );

    await ctx.answerCallbackQuery(ctx.t("credit.markedPaid"));
    await renderCredit(ctx, payment.creditId, true);
    await ctx.reply(
      ctx.t("credit.expensePosted", {
        bank: esc(payment.credit.bankName),
        amount: money,
        source: ctx.t(
          payment.credit.source === TxSource.BANK ? "common.bank" : "common.cash"
        ),
        company: esc(payment.credit.company.name),
      }),
      { parse_mode: "HTML" }
    );
  }
);
