import { Composer, InlineKeyboard } from "grammy";
import { Role, type Transaction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney, parseAmount, toNumber } from "@/lib/money";
import { EDIT_WINDOW_MS, logAction, withinEditWindow } from "../auth";
import { BTN, cancelMenu } from "../keyboards";
import { entryActions, finish, onStep } from "../helpers";
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
  if (!tx) return { allowed: false, reason: "Entry not found." };

  if (ctx.role === Role.ADMIN) return { allowed: true, tx };

  if (tx.userId !== ctx.user.id) {
    return { allowed: false, reason: "You can only edit your own entries." };
  }
  if (!withinEditWindow(tx.createdAt)) {
    const minutes = Math.round(EDIT_WINDOW_MS / 60000);
    return {
      allowed: false,
      reason: `The ${minutes}-minute editing window has closed. Ask an administrator.`,
    };
  }
  return { allowed: true, tx };
}

// ---------- Listing ----------

entriesFlow.hears(BTN.myEntries, async (ctx) => {
  const entries = await prisma.transaction.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
  });

  if (entries.length === 0) {
    await ctx.reply("You have not added any entries yet.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const tx of entries) {
    kb.text(txLine(tx), `txopen:${tx.id}`).row();
  }

  await ctx.reply(
    `📝 <b>Your last ${entries.length} entries</b>\n\nTap one to view or correct it:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
});

entriesFlow.callbackQuery(/^txopen:(.+)$/, async (ctx) => {
  const tx = await prisma.transaction.findUnique({ where: { id: ctx.match![1] } });
  if (!tx) {
    await ctx.answerCallbackQuery("Entry not found.");
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(txCard(tx), {
    parse_mode: "HTML",
    reply_markup: entryActions(tx),
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
    `Current amount: <b>${formatMoney(toNumber(check.tx.amount), check.tx.currency)}</b>\n\n` +
      "Enter the new amount:",
    { parse_mode: "HTML", reply_markup: cancelMenu() }
  );
});

onStep(entriesFlow, "edit:amount", async (ctx) => {
  const parsed = parseAmount(ctx.message!.text!);
  if (!parsed) {
    await ctx.reply("⚠️ I could not read that amount. Try again, e.g. 250000");
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
    `${before} → ${formatMoney(parsed.amount, parsed.currency)}`
  );
  await finish(ctx, `✅ Amount updated.\n\n${txCard(tx)}`);
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
  await ctx.reply("Enter the new comment:", { reply_markup: cancelMenu() });
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

  await logAction(ctx.user.id, "TRANSACTION_COMMENT_EDITED", tx.comment ?? "");
  await finish(ctx, `✅ Comment updated.\n\n${txCard(tx)}`);
});

// ---------- Deleting ----------

entriesFlow.callbackQuery(/^txdel:(.+)$/, async (ctx) => {
  const check = await checkEditable(ctx, ctx.match![1]);
  if (!check.allowed) {
    await ctx.answerCallbackQuery({ text: check.reason, show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(`Delete this entry?\n\n${txCard(check.tx)}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("🗑 Yes, delete", `txdelyes:${check.tx.id}`)
      .text("↩️ Cancel", "txdelno"),
  });
});

entriesFlow.callbackQuery("txdelno", async (ctx) => {
  await ctx.answerCallbackQuery("Cancelled");
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
});

entriesFlow.callbackQuery(/^txdelyes:(.+)$/, async (ctx) => {
  const check = await checkEditable(ctx, ctx.match![1]);
  if (!check.allowed) {
    await ctx.answerCallbackQuery({ text: check.reason, show_alert: true });
    return;
  }

  await prisma.transaction.delete({ where: { id: check.tx.id } });
  await logAction(
    ctx.user.id,
    "TRANSACTION_DELETED",
    `${check.tx.source} ${check.tx.type} · ${formatMoney(toNumber(check.tx.amount), check.tx.currency)}`
  );

  await ctx.answerCallbackQuery("🗑 Deleted");
  await ctx.editMessageText("🗑 Entry deleted.").catch(() => undefined);
});
