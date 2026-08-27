import { Composer, InlineKeyboard } from "grammy";
import { Role, TxOrigin, type Transaction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount, toNumber } from "@/lib/money";
import { EDIT_WINDOW_MS, logAction, withinEditWindow } from "../auth";
import { cancelMenu } from "../keyboards";
import { labels } from "../i18n";
import { entryActions, finish, onePerRow, onStep } from "../helpers";
import { requireActiveStore } from "../stores";
import { txCard, txLine } from "../format";
import type { BotContext } from "../types";

/**
 * Viewing and correcting entries.
 *
 * An author may amend their own entry for 30 minutes after creating it.
 * ADMIN is treated as the owner of the books and can amend any entry at any
 * time, which is what makes mistakes fixable once the window has closed.
 */
export const entriesFlow = new Composer<BotContext>();

const RECENT_LIMIT = 10;

type Permission = { allowed: true; tx: Transaction } | { allowed: false; reason: string };

async function checkEditable(ctx: BotContext, txId: string): Promise<Permission> {
  const tx = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!tx || tx.isDeleted) return { allowed: false, reason: ctx.t("entry.notFound") };

  // A button from another store may still be on screen.
  if (tx.companyId !== ctx.activeCompany?.id) {
    return { allowed: false, reason: ctx.t("store.noAccess") };
  }

  // Automatic postings mirror a credit instalment or a regular payment.
  // Editing one here would leave the two out of step, so the source is the
  // only place they can be undone — for admins too.
  if (tx.origin !== TxOrigin.MANUAL) {
    return { allowed: false, reason: ctx.t("entry.autoLocked") };
  }

  if (ctx.role === Role.ADMIN) return { allowed: true, tx };

  if (tx.userId !== ctx.user.id) {
    return { allowed: false, reason: ctx.t("entry.onlyOwn") };
  }
  if (!withinEditWindow(tx.createdAt)) {
    return {
      allowed: false,
      reason: ctx.t("entry.windowClosed", {
        minutes: Math.round(EDIT_WINDOW_MS / 60000),
      }),
    };
  }
  return { allowed: true, tx };
}

// ---------- Listing ----------

entriesFlow.hears(labels("btn.myEntries"), requireActiveStore, async (ctx) => {
  const entries = await prisma.transaction.findMany({
    // Scoped to the open store, so a correction can only ever touch the books
    // the user is standing in.
    where: {
      userId: ctx.user.id,
      isDeleted: false,
      companyId: ctx.activeCompany!.id,
    },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
  });

  if (entries.length === 0) {
    await ctx.reply(ctx.t("entry.none"));
    return;
  }

  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const tx of entries) {
    addRow(txLine(tx, ctx.locale), `txopen:${tx.id}`);
  }

  await ctx.reply(ctx.t("entry.list", { count: entries.length }), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

entriesFlow.callbackQuery(/^txopen:(.+)$/, requireActiveStore, async (ctx) => {
  const tx = await prisma.transaction.findUnique({ where: { id: ctx.match![1] } });
  if (!tx || tx.isDeleted || tx.companyId !== ctx.activeCompany?.id) {
    await ctx.answerCallbackQuery(ctx.t("entry.notFound"));
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(txCard(tx, ctx.locale), {
    parse_mode: "HTML",
    reply_markup: entryActions(tx, ctx),
  });
});

// ---------- Editing ----------

entriesFlow.callbackQuery(/^txamt:(.+)$/, async (ctx) => {
  const check = await checkEditable(ctx, ctx.match![1]);
  if (!check.allowed) {
    await ctx.answerCallbackQuery({ text: check.reason, show_alert: true });
    return;
  }

  ctx.session.step = "edit:amount";
  ctx.session.draft = { txId: check.tx.id };
  await ctx.answerCallbackQuery();
  await ctx.reply(
    ctx.t("entry.askAmount", {
      amount: formatMoney(toNumber(check.tx.amount), check.tx.currency),
    }),
    { parse_mode: "HTML", reply_markup: cancelMenu(ctx.locale) }
  );
});

onStep(entriesFlow, "edit:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply(ctx.t("common.badAmount", { example: "250000" }));
    return;
  }

  const txId = ctx.session.draft.txId as string;
  const check = await checkEditable(ctx, txId);
  if (!check.allowed) {
    await finish(ctx, `⛔️ ${check.reason}`);
    return;
  }

  const before = formatMoney(toNumber(check.tx.amount), check.tx.currency);
  const tx = await prisma.transaction.update({
    where: { id: txId },
    data: { amount: parsed.amount, currency: parsed.currency },
  });

  await logAction(
    ctx.user.id,
    "TRANSACTION_AMOUNT_EDITED",
    `${before} → ${formatMoney(parsed.amount, parsed.currency)}`,
    tx.companyId
  );
  await finish(ctx, `${ctx.t("entry.amountUpdated")}\n\n${txCard(tx, ctx.locale)}`);
});

entriesFlow.callbackQuery(/^txcom:(.+)$/, async (ctx) => {
  const check = await checkEditable(ctx, ctx.match![1]);
  if (!check.allowed) {
    await ctx.answerCallbackQuery({ text: check.reason, show_alert: true });
    return;
  }

  ctx.session.step = "edit:comment";
  ctx.session.draft = { txId: check.tx.id };
  await ctx.answerCallbackQuery();
  await ctx.reply(ctx.t("entry.askComment"), {
    reply_markup: cancelMenu(ctx.locale),
  });
});

onStep(entriesFlow, "edit:comment", async (ctx) => {
  const txId = ctx.session.draft.txId as string;
  const check = await checkEditable(ctx, txId);
  if (!check.allowed) {
    await finish(ctx, `⛔️ ${check.reason}`);
    return;
  }

  const tx = await prisma.transaction.update({
    where: { id: txId },
    data: { comment: ctx.message!.text!.trim() },
  });

  await logAction(
    ctx.user.id,
    "TRANSACTION_COMMENT_EDITED",
    tx.comment ?? "",
    tx.companyId
  );
  await finish(ctx, `${ctx.t("entry.commentUpdated")}\n\n${txCard(tx, ctx.locale)}`);
});

// ---------- Deleting ----------

entriesFlow.callbackQuery(/^txdel:(.+)$/, async (ctx) => {
  const check = await checkEditable(ctx, ctx.match![1]);
  if (!check.allowed) {
    await ctx.answerCallbackQuery({ text: check.reason, show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `${ctx.t("entry.confirmDelete")}\n\n${txCard(check.tx, ctx.locale)}`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text(ctx.t("entry.deleteYes"), `txdelyes:${check.tx.id}`)
        .text(ctx.t("entry.deleteNo"), "txdelno"),
    }
  );
});

entriesFlow.callbackQuery("txdelno", async (ctx) => {
  await ctx.answerCallbackQuery(ctx.t("common.cancelled"));
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
});

entriesFlow.callbackQuery(/^txdelyes:(.+)$/, async (ctx) => {
  const check = await checkEditable(ctx, ctx.match![1]);
  if (!check.allowed) {
    await ctx.answerCallbackQuery({ text: check.reason, show_alert: true });
    return;
  }

  // Soft delete: financial records are never dropped, so the action log can
  // still show what was removed, by whom, and for how much.
  await prisma.transaction.update({
    where: { id: check.tx.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await logAction(
    ctx.user.id,
    "TRANSACTION_DELETED",
    `${check.tx.source} ${check.tx.type} · ${formatMoney(toNumber(check.tx.amount), check.tx.currency)}`,
    check.tx.companyId
  );

  await ctx.answerCallbackQuery(ctx.t("entry.deleted"));
  await ctx.editMessageText(ctx.t("entry.deletedFull")).catch(() => undefined);
});
