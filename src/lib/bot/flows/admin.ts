import { Composer, InlineKeyboard } from "grammy";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction, requireModule } from "../auth";
import { labels, roleBadge, roleLabel, t } from "../i18n";
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


// ---------- Access requests ----------

/** Buttons offered for one pending applicant. */
function decisionKeyboard(ctx: BotContext, applicantId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(ctx.t("req.asCashier"), `appr:${applicantId}:CASHIER`)
    .text(ctx.t("req.asAccountant"), `appr:${applicantId}:ACCOUNTANT`)
    .row()
    .text(ctx.t("req.reject"), `rej:${applicantId}`);
}

adminFlow.hears(labels("btn.requests"), requireModule("ADMIN"), async (ctx) => {
  const pending = await prisma.user.findMany({
    where: { status: UserStatus.PENDING },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) {
    await ctx.reply(ctx.t("req.empty"), { parse_mode: "HTML" });
    return;
  }

  await ctx.reply(ctx.t("req.title", { count: pending.length }), {
    parse_mode: "HTML",
  });

  // One message per applicant, so each carries its own decision buttons.
  for (const applicant of pending) {
    await ctx.reply(
      `<b>${esc(applicant.name)}</b>
<code>${applicant.telegramId}</code>`,
      { parse_mode: "HTML", reply_markup: decisionKeyboard(ctx, applicant.id) }
    );
  }
});

/**
 * Approving sets the role and activates the account, then tells the applicant
 * in their own language. A request that someone else already handled is
 * reported rather than silently re-applied.
 */
adminFlow.callbackQuery(
  /^appr:(.+):(CASHIER|ACCOUNTANT)$/,
  requireModule("ADMIN"),
  async (ctx) => {
    const [, applicantId, rawRole] = ctx.match!;
    const role = rawRole as Role;

    const applicant = await prisma.user.findUnique({ where: { id: applicantId } });
    if (!applicant) {
      await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
      return;
    }
    if (applicant.status !== UserStatus.PENDING) {
      await ctx.answerCallbackQuery(ctx.t("req.alreadyHandled"));
      return;
    }

    const updated = await prisma.user.update({
      where: { id: applicant.id },
      data: { role, status: UserStatus.ACTIVE },
    });

    await logAction(
      ctx.user.id,
      "ACCESS_GRANTED",
      `${updated.name} · ${role} · ${updated.telegramId}`
    );

    // The applicant may have blocked the bot in the meantime.
    await ctx.api
      .sendMessage(
        updated.telegramId.toString(),
        t(updated.language, "access.granted", {
          role: roleLabel(updated.language, role),
        }),
        { parse_mode: "HTML" }
      )
      .catch(() => undefined);

    await ctx.answerCallbackQuery(roleLabel(ctx.locale, role));
    await ctx.editMessageText(
      ctx.t("req.approved", {
        name: esc(updated.name),
        role: roleLabel(ctx.locale, role),
      }),
      { parse_mode: "HTML" }
    ).catch(() => undefined);
  }
);

adminFlow.callbackQuery(/^rej:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const applicant = await prisma.user.findUnique({ where: { id: ctx.match![1] } });
  if (!applicant) {
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
    return;
  }
  if (applicant.status !== UserStatus.PENDING) {
    await ctx.answerCallbackQuery(ctx.t("req.alreadyHandled"));
    return;
  }

  const updated = await prisma.user.update({
    where: { id: applicant.id },
    data: { status: UserStatus.REJECTED },
  });

  await logAction(
    ctx.user.id,
    "ACCESS_DECLINED",
    `${updated.name} · ${updated.telegramId}`
  );

  await ctx.answerCallbackQuery(ctx.t("req.reject"));
  await ctx.editMessageText(
    ctx.t("req.rejectedDone", { name: esc(updated.name) }),
    { parse_mode: "HTML" }
  ).catch(() => undefined);
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
    create: { telegramId, name, role, status: UserStatus.ACTIVE },
    update: { name, role, status: UserStatus.ACTIVE },
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
    data: { status: UserStatus.REJECTED },
  });

  await ctx.api
    .sendMessage(user.telegramId.toString(), t(user.language, "access.revokedNotice"))
    .catch(() => undefined);

  await logAction(ctx.user.id, "USER_ACCESS_REVOKED", `${user.name} · ${user.telegramId}`);
  await ctx.answerCallbackQuery(ctx.t("admin.accessRevoked"));
  await ctx.editMessageText(
    ctx.t("admin.accessRevokedFull", { name: esc(user.name) }),
    { parse_mode: "HTML" }
  );
});
