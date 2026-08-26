import { Composer, InlineKeyboard } from "grammy";
import { CreditStatus, type Currency } from "@prisma/client";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount, toNumber } from "@/lib/money";
import { logAction, requireModule } from "../auth";
import { BTN, cancelMenu, mainMenu } from "../keyboards";
import { onStep, resetSession } from "../helpers";
import { esc, fmtDate } from "../format";
import type { BotContext } from "../types";

/**
 * Credit wizard: bank name → total amount → duration in months.
 * The monthly schedule is generated automatically on save.
 */
export const creditFlow = new Composer<BotContext>();

/** How many unpaid instalments are offered as buttons at once. */
const VISIBLE_PAYMENTS = 12;

/**
 * Splits `total` into `months` instalments without losing minor units:
 * every instalment is rounded to 2 decimals and the last one absorbs the
 * rounding remainder so the schedule always sums back to `total`.
 */
export function buildSchedule(total: number, months: number, from: Date) {
  const base = Math.round((total / months) * 100) / 100;
  return Array.from({ length: months }, (_, index) => {
    const isLast = index === months - 1;
    const amount = isLast
      ? Math.round((total - base * (months - 1)) * 100) / 100
      : base;
    return { amount, dueDate: addMonths(from, index + 1) };
  });
}

// ---------- Creating a credit ----------

creditFlow.hears(BTN.addCredit, requireModule("CREDIT"), async (ctx) => {
  ctx.session.step = "credit:bank";
  ctx.session.draft = {};
  await ctx.reply("💳 <b>New credit</b>\n\nEnter the bank name:", {
    parse_mode: "HTML",
    reply_markup: cancelMenu(),
  });
});

onStep(creditFlow, "credit:bank", async (ctx) => {
  ctx.session.draft.bankName = ctx.message!.text!.trim();
  ctx.session.step = "credit:amount";
  await ctx.reply("Enter the total credit amount:", { reply_markup: cancelMenu() });
});

onStep(creditFlow, "credit:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply("⚠️ I could not read that amount. Try again, e.g. 120000000");
    return;
  }
  ctx.session.draft.totalAmount = parsed.amount;
  ctx.session.draft.currency = parsed.currency;
  ctx.session.step = "credit:duration";
  await ctx.reply(
    `Total: <b>${formatMoney(parsed.amount, parsed.currency)}</b>\n\n` +
      "Enter the duration in months (1–360):",
    { parse_mode: "HTML", reply_markup: cancelMenu() }
  );
});

onStep(creditFlow, "credit:duration", async (ctx) => {
  const months = Number(ctx.message!.text!.trim());
  if (!Number.isInteger(months) || months < 1 || months > 360) {
    await ctx.reply("⚠️ Enter a whole number of months between 1 and 360.");
    return;
  }

  const draft = ctx.session.draft;
  const total = draft.totalAmount as number;
  const currency = draft.currency as Currency;
  const schedule = buildSchedule(total, months, new Date());

  const credit = await prisma.credit.create({
    data: {
      bankName: draft.bankName as string,
      totalAmount: total,
      currency,
      duration: months,
      userId: ctx.user.id,
      payments: { create: schedule },
    },
  });

  await logAction(
    ctx.user.id,
    "CREDIT_CREATED",
    `${esc(credit.bankName)} · ${formatMoney(total, currency)} · ${months} months`
  );

  resetSession(ctx);
  await ctx.reply(
    `✅ <b>Credit created</b>\n\n` +
      `Bank: ${esc(credit.bankName)}\n` +
      `Total: ${formatMoney(total, currency)}\n` +
      `Duration: ${months} months\n` +
      `Monthly payment: ${formatMoney(schedule[0].amount, currency)}\n` +
      `First payment due: ${fmtDate(schedule[0].dueDate)}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(
        "📋 Open schedule",
        `credit:${credit.id}`
      ),
    }
  );
  await ctx.reply("Choose the next action:", { reply_markup: mainMenu(ctx.role) });
});

// ---------- Browsing credits ----------

creditFlow.hears(BTN.credits, requireModule("CREDIT"), async (ctx) => {
  const credits = await prisma.credit.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 20,
    include: { payments: { select: { isPaid: true } } },
  });

  if (credits.length === 0) {
    await ctx.reply("No credits have been added yet.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const credit of credits) {
    const paid = credit.payments.filter((p) => p.isPaid).length;
    const mark = credit.status === CreditStatus.CLOSED ? "✅" : "💳";
    kb.text(
      `${mark} ${credit.bankName} · ${paid}/${credit.payments.length}`,
      `credit:${credit.id}`
    ).row();
  }

  await ctx.reply("📋 <b>Credits</b>\n\nChoose one to open its schedule:", {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

/** Renders a credit with its outstanding instalments as tappable buttons. */
async function renderCredit(ctx: BotContext, creditId: string, edit: boolean) {
  const credit = await prisma.credit.findUnique({
    where: { id: creditId },
    include: { payments: { orderBy: { dueDate: "asc" } } },
  });

  if (!credit) {
    await ctx.answerCallbackQuery("Credit not found.");
    return;
  }

  const paid = credit.payments.filter((p) => p.isPaid);
  const unpaid = credit.payments.filter((p) => !p.isPaid);
  const paidSum = paid.reduce((sum, p) => sum + toNumber(p.amount), 0);
  const total = toNumber(credit.totalAmount);

  const text = [
    `💳 <b>${esc(credit.bankName)}</b>`,
    `Total: ${formatMoney(total, credit.currency)}`,
    `Duration: ${credit.duration} months`,
    `Paid: ${formatMoney(paidSum, credit.currency)} (${paid.length}/${credit.payments.length})`,
    `Remaining: ${formatMoney(total - paidSum, credit.currency)}`,
    `Status: ${credit.status === CreditStatus.CLOSED ? "✅ Closed" : "🔄 Active"}`,
    "",
    unpaid.length
      ? "Tap an instalment to mark it as paid:"
      : "All instalments have been paid.",
  ].join("\n");

  const kb = new InlineKeyboard();
  for (const payment of unpaid.slice(0, VISIBLE_PAYMENTS)) {
    const overdue = payment.dueDate < new Date() ? "⚠️ " : "";
    kb.text(
      `${overdue}${fmtDate(payment.dueDate)} · ${formatMoney(toNumber(payment.amount), credit.currency)}`,
      `pay:${payment.id}`
    ).row();
  }
  if (unpaid.length > VISIBLE_PAYMENTS) {
    kb.text(`… ${unpaid.length - VISIBLE_PAYMENTS} more instalments`, "noop").row();
  }

  const options = { parse_mode: "HTML" as const, reply_markup: kb };
  if (edit) {
    await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
  } else {
    await ctx.reply(text, options);
  }
}

creditFlow.callbackQuery(/^credit:(.+)$/, requireModule("CREDIT"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderCredit(ctx, ctx.match![1], true);
});

creditFlow.callbackQuery("noop", (ctx) =>
  ctx.answerCallbackQuery("Pay the earlier instalments first.")
);

// ---------- Marking an instalment as paid ----------

creditFlow.callbackQuery(/^pay:(.+)$/, requireModule("CREDIT"), async (ctx) => {
  const paymentId = ctx.match![1];
  const payment = await prisma.creditPayment.findUnique({
    where: { id: paymentId },
    include: { credit: true },
  });

  if (!payment) {
    await ctx.answerCallbackQuery("Instalment not found.");
    return;
  }
  if (payment.isPaid) {
    await ctx.answerCallbackQuery("Already marked as paid.");
    return;
  }

  await prisma.creditPayment.update({
    where: { id: paymentId },
    data: { isPaid: true, paidDate: new Date() },
  });

  // Close the credit once nothing is outstanding.
  const remaining = await prisma.creditPayment.count({
    where: { creditId: payment.creditId, isPaid: false },
  });
  if (remaining === 0) {
    await prisma.credit.update({
      where: { id: payment.creditId },
      data: { status: CreditStatus.CLOSED },
    });
  }

  await logAction(
    ctx.user.id,
    "CREDIT_PAYMENT_PAID",
    `${esc(payment.credit.bankName)} · ${formatMoney(toNumber(payment.amount), payment.credit.currency)} · due ${fmtDate(payment.dueDate)}`
  );

  await ctx.answerCallbackQuery("✅ Marked as paid");
  await renderCredit(ctx, payment.creditId, true);
});
