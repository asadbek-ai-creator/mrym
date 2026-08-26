import { Composer, InlineKeyboard } from "grammy";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction, requireModule } from "../auth";
import { BTN } from "../keyboards";
import { esc, fmtDateTime } from "../format";
import type { BotContext } from "../types";

/** Admin-only: audit trail and user management. */
export const adminFlow = new Composer<BotContext>();

const LOG_LIMIT = 20;

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "👑 Admin",
  ACCOUNTANT: "📚 Accountant",
  CASHIER: "💵 Cashier",
};

// ---------- Action log ----------

adminFlow.hears(BTN.logs, requireModule("ADMIN"), async (ctx) => {
  const logs = await prisma.actionLog.findMany({
    orderBy: { timestamp: "desc" },
    take: LOG_LIMIT,
    include: { user: { select: { name: true, role: true } } },
  });

  if (logs.length === 0) {
    await ctx.reply("The action log is empty.");
    return;
  }

  const lines = logs.map((log) => {
    const who = log.user ? `${esc(log.user.name)} (${log.user.role})` : "system";
    const details = log.details ? `\n   ${esc(log.details)}` : "";
    return `🕒 ${fmtDateTime(log.timestamp)}\n   <b>${esc(log.action)}</b> — ${who}${details}`;
  });

  await ctx.reply(`🧾 <b>Last ${logs.length} actions</b>\n\n${lines.join("\n\n")}`, {
    parse_mode: "HTML",
  });
});

// ---------- Users ----------

adminFlow.hears(BTN.users, requireModule("ADMIN"), async (ctx) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  const lines = users.map(
    (user) =>
      `${ROLE_LABEL[user.role]} — <b>${esc(user.name)}</b>\n   <code>${user.telegramId}</code>`
  );

  await ctx.reply(
    `👥 <b>Users (${users.length})</b>\n\n${lines.join("\n")}\n\n` +
      "Add or change a user:\n" +
      "<code>/adduser &lt;telegram_id&gt; &lt;cashier|accountant|admin&gt; &lt;name&gt;</code>\n" +
      "Remove a user:\n" +
      "<code>/deluser &lt;telegram_id&gt;</code>",
    { parse_mode: "HTML" }
  );
});

const ROLE_INPUT: Record<string, Role> = {
  admin: Role.ADMIN,
  accountant: Role.ACCOUNTANT,
  cashier: Role.CASHIER,
};

adminFlow.command("adduser", requireModule("ADMIN"), async (ctx) => {
  const parts = ctx.match.trim().split(/\s+/).filter(Boolean);
  const [rawId, rawRole, ...nameParts] = parts;

  if (!rawId || !rawRole || nameParts.length === 0) {
    await ctx.reply(
      "Usage:\n<code>/adduser 123456789 cashier Aziz Karimov</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  if (!/^\d+$/.test(rawId)) {
    await ctx.reply("⚠️ The Telegram ID must be a number.");
    return;
  }

  const role = ROLE_INPUT[rawRole.toLowerCase()];
  if (!role) {
    await ctx.reply("⚠️ Role must be one of: cashier, accountant, admin.");
    return;
  }

  const telegramId = BigInt(rawId);
  const name = nameParts.join(" ");
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, name, role },
    update: { name, role },
  });

  await logAction(ctx.user.id, "USER_UPSERTED", `${name} · ${role} · ${telegramId}`);
  await ctx.reply(
    `✅ Saved.\n\n${ROLE_LABEL[user.role]} — <b>${esc(user.name)}</b>\n<code>${user.telegramId}</code>`,
    { parse_mode: "HTML" }
  );
});

adminFlow.command("deluser", requireModule("ADMIN"), async (ctx) => {
  const rawId = ctx.match.trim();
  if (!/^\d+$/.test(rawId)) {
    await ctx.reply("Usage:\n<code>/deluser 123456789</code>", { parse_mode: "HTML" });
    return;
  }

  const telegramId = BigInt(rawId);
  if (telegramId === BigInt(ctx.from!.id)) {
    await ctx.reply("⚠️ You cannot remove your own account.");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { _count: { select: { transactions: true, credits: true } } },
  });

  if (!user) {
    await ctx.reply("⚠️ No user with that ID.");
    return;
  }

  // Entries carry a required author, so a user with history is demoted rather
  // than deleted; that keeps the books and the audit trail intact.
  if (user._count.transactions > 0 || user._count.credits > 0) {
    await ctx.reply(
      `⚠️ <b>${esc(user.name)}</b> has ${user._count.transactions} entries and ` +
        `${user._count.credits} credits, so the record cannot be deleted.\n\n` +
        "Remove their access instead?",
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(
          "🚫 Revoke access",
          `revoke:${user.id}`
        ),
      }
    );
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  await logAction(ctx.user.id, "USER_DELETED", `${user.name} · ${telegramId}`);
  await ctx.reply(`🗑 <b>${esc(user.name)}</b> has been removed.`, {
    parse_mode: "HTML",
  });
});

/**
 * Revoking access moves the Telegram id out of the way (keeping it unique)
 * so the person can no longer be resolved by the auth middleware, while the
 * row itself stays attached to their historical entries.
 */
adminFlow.callbackQuery(/^revoke:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const user = await prisma.user.findUnique({ where: { id: ctx.match![1] } });
  if (!user) {
    await ctx.answerCallbackQuery("User not found.");
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId: -user.telegramId,
      name: `${user.name} (revoked)`,
    },
  });

  await logAction(ctx.user.id, "USER_ACCESS_REVOKED", `${user.name} · ${user.telegramId}`);
  await ctx.answerCallbackQuery("Access revoked");
  await ctx.editMessageText(`🚫 Access revoked for <b>${esc(user.name)}</b>.`, {
    parse_mode: "HTML",
  });
});
