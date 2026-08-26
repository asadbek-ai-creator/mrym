import { Composer, InlineKeyboard } from "grammy";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction, requireModule } from "../auth";
import { labels, roleBadge, roleLabel } from "../i18n";
import { esc, fmtDateTime } from "../format";
import type { BotContext } from "../types";

/** Admin-only: audit trail and user management. */
export const adminFlow = new Composer<BotContext>();

const LOG_LIMIT = 20;

// ---------- Action log ----------

adminFlow.hears(labels("btn.logs"), requireModule("ADMIN"), async (ctx) => {
  const logs = await prisma.actionLog.findMany({
    orderBy: { timestamp: "desc" },
    take: LOG_LIMIT,
    include: { user: { select: { name: true, role: true } } },
  });

  if (logs.length === 0) {
    await ctx.reply(ctx.t("admin.logEmpty"));
    return;
  }

  const lines = logs.map((log) => {
    const who = log.user
      ? `${esc(log.user.name)} (${roleLabel(ctx.locale, log.user.role)})`
      : ctx.t("admin.system");
    const details = log.details ? `\n   ${esc(log.details)}` : "";
    return `🕒 ${fmtDateTime(log.timestamp)}\n   <b>${esc(log.action)}</b> — ${who}${details}`;
  });

  await ctx.reply(
    `${ctx.t("admin.logTitle", { count: logs.length })}\n\n${lines.join("\n\n")}`,
    { parse_mode: "HTML" }
  );
});

// ---------- Users ----------

adminFlow.hears(labels("btn.users"), requireModule("ADMIN"), async (ctx) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  const lines = users.map(
    (user) =>
      `${roleBadge(ctx.locale, user.role)} — <b>${esc(user.name)}</b>\n   <code>${user.telegramId}</code>`
  );

  await ctx.reply(
    `${ctx.t("admin.usersTitle", { count: users.length })}\n\n${lines.join("\n")}\n\n` +
      ctx.t("admin.usersHelp"),
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
    await ctx.reply(ctx.t("admin.addUserUsage"), { parse_mode: "HTML" });
    return;
  }

  if (!/^\d+$/.test(rawId)) {
    await ctx.reply(ctx.t("admin.idMustBeNumber"));
    return;
  }

  const role = ROLE_INPUT[rawRole.toLowerCase()];
  if (!role) {
    await ctx.reply(ctx.t("admin.badRole"));
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
    `${ctx.t("admin.userSaved")}\n\n${roleBadge(ctx.locale, user.role)} — ` +
      `<b>${esc(user.name)}</b>\n<code>${user.telegramId}</code>`,
    { parse_mode: "HTML" }
  );
});

adminFlow.command("deluser", requireModule("ADMIN"), async (ctx) => {
  const rawId = ctx.match.trim();
  if (!/^\d+$/.test(rawId)) {
    await ctx.reply(ctx.t("admin.delUserUsage"), { parse_mode: "HTML" });
    return;
  }

  const telegramId = BigInt(rawId);
  if (telegramId === BigInt(ctx.from!.id)) {
    await ctx.reply(ctx.t("admin.cannotRemoveSelf"));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { _count: { select: { transactions: true, credits: true } } },
  });

  if (!user) {
    await ctx.reply(ctx.t("admin.noSuchUser"));
    return;
  }

  // Entries carry a required author, so a user with history is demoted rather
  // than deleted; that keeps the books and the audit trail intact.
  if (user._count.transactions > 0 || user._count.credits > 0) {
    await ctx.reply(
      ctx.t("admin.hasHistory", {
        name: esc(user.name),
        transactions: user._count.transactions,
        credits: user._count.credits,
      }),
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(
          ctx.t("admin.revokeButton"),
          `revoke:${user.id}`
        ),
      }
    );
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  await logAction(ctx.user.id, "USER_DELETED", `${user.name} · ${telegramId}`);
  await ctx.reply(ctx.t("admin.userRemoved", { name: esc(user.name) }), {
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
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
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
  await ctx.answerCallbackQuery(ctx.t("admin.accessRevoked"));
  await ctx.editMessageText(
    ctx.t("admin.accessRevokedFull", { name: esc(user.name) }),
    { parse_mode: "HTML" }
  );
});
