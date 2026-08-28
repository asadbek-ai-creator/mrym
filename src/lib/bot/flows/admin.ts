import { Composer, InlineKeyboard } from "grammy";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bootstrapAdminIds } from "@/lib/env";
import { logAction, requireModule } from "../auth";
import { labels, roleBadge, roleLabel, statusLabel, t } from "../i18n";
import { onePerRow } from "../helpers";
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

/** Role buttons, weakest first, so the destructive end of the list is last. */
const ROLE_ORDER: Role[] = [Role.CASHIER, Role.ACCOUNTANT, Role.ADMIN];

/** Button labels have to stay short enough to survive on a phone. */
const NAME_ON_BUTTON = 28;

function shorten(name: string): string {
  return name.length > NAME_ON_BUTTON ? `${name.slice(0, NAME_ON_BUTTON - 1)}…` : name;
}

/**
 * Everyone the bot knows, one tappable button per person.
 *
 * The list is a keyboard rather than text because changing a role used to mean
 * retyping a Telegram id, a role word and a name into `/adduser` — the single
 * most error-prone thing an admin ever had to do here.
 */
async function renderUserList(ctx: BotContext, edit: boolean): Promise<void> {
  const users = await prisma.user.findMany({
    // Role order follows the enum, so admins head the list.
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const text =
    users.length === 0
      ? ctx.t("admin.usersEmpty")
      : `${ctx.t("admin.usersTitle", { count: users.length })}\n\n${ctx.t("admin.usersHelp")}`;

  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const user of users) {
    const mark =
      user.status === UserStatus.ACTIVE ? "" : ` · ${statusLabel(ctx.locale, user.status)}`;
    addRow(
      `${roleBadge(ctx.locale, user.role)} ${shorten(user.name)}${mark}`,
      `usr:${user.id}`
    );
  }

  const options = { parse_mode: "HTML" as const, reply_markup: kb };
  if (edit) {
    await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
  } else {
    await ctx.reply(text, options);
  }
}

/**
 * One person's card: what they are, what they hold, and the buttons that
 * change it. Re-read on every render so two admins working at once cannot
 * act on a stale screen.
 */
async function renderUserCard(
  ctx: BotContext,
  userId: string,
  edit: boolean
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { transactions: true, credits: true, companies: true } },
    },
  });

  if (!user) {
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
    return;
  }

  const text = ctx.t("admin.userCard", {
    badge: roleBadge(ctx.locale, user.role),
    name: esc(user.name),
    id: user.telegramId.toString(),
    status: statusLabel(ctx.locale, user.status),
    // Admins reach every store without being granted each one.
    stores: user.role === Role.ADMIN ? "—" : user._count.companies,
    transactions: user._count.transactions,
    credits: user._count.credits,
  });

  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const role of ROLE_ORDER) {
    const mark = user.role === role ? "✅" : "◽";
    addRow(`${mark} ${roleLabel(ctx.locale, role)}`, `usrole:${user.id}:${role}`);
  }

  if (user.status === UserStatus.ACTIVE) {
    addRow(ctx.t("admin.revokeButton"), `revoke:${user.id}`);
  } else {
    addRow(ctx.t("admin.btnRestore"), `usrres:${user.id}`);
  }
  addRow(ctx.t("admin.btnDelete"), `usrdel:${user.id}`);
  addRow(ctx.t("admin.btnBack"), "usrlist");

  const options = { parse_mode: "HTML" as const, reply_markup: kb };
  if (edit) {
    await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
  } else {
    await ctx.reply(text, options);
  }
}

adminFlow.hears(labels("btn.users"), requireModule("ADMIN"), (ctx) =>
  renderUserList(ctx, false)
);

adminFlow.callbackQuery("usrlist", requireModule("ADMIN"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderUserList(ctx, true);
});

adminFlow.callbackQuery(/^usr:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderUserCard(ctx, ctx.match![1], true);
});

// ---------- Changing a role ----------

/**
 * Applies a role change, after re-deriving from the database everything the
 * button claims: the keyboard may have been sitting on screen since before
 * the last admin resigned, or before the owner edited ADMIN_TELEGRAM_IDS.
 *
 * `confirmed` is what the second tap sets — promotion to ADMIN hands over the
 * books, the log and the dashboard, so it is never one tap away.
 */
async function changeRole(
  ctx: BotContext,
  userId: string,
  role: Role,
  confirmed: boolean
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { companies: true } } },
  });

  if (!user) {
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
    return;
  }
  if (user.id === ctx.user.id) {
    await ctx.answerCallbackQuery({
      text: ctx.t("admin.cannotChangeSelf"),
      show_alert: true,
    });
    return;
  }
  if (user.role === role) {
    await ctx.answerCallbackQuery(
      ctx.t("admin.roleUnchanged", { role: roleLabel(ctx.locale, role) })
    );
    return;
  }

  if (role !== Role.ADMIN) {
    // A bootstrap id is repaired back to ADMIN by the auth middleware on the
    // owner's very next message, so demoting one here would only look like it
    // worked. Say what actually has to change instead.
    if (bootstrapAdminIds().includes(user.telegramId)) {
      await ctx.answerCallbackQuery({
        text: ctx.t("admin.bootstrapLocked"),
        show_alert: true,
      });
      return;
    }

    if (user.role === Role.ADMIN) {
      const otherAdmins = await prisma.user.count({
        where: { role: Role.ADMIN, status: UserStatus.ACTIVE, id: { not: user.id } },
      });
      if (otherAdmins === 0) {
        await ctx.answerCallbackQuery({
          text: ctx.t("admin.lastAdmin"),
          show_alert: true,
        });
        return;
      }
    }
  }

  if (role === Role.ADMIN && !confirmed) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      ctx.t("admin.confirmAdmin", { name: esc(user.name) }),
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text(ctx.t("admin.btnConfirmAdmin"), `usroleyes:${user.id}:${Role.ADMIN}`)
          .row()
          .text(ctx.t("admin.btnBack"), `usr:${user.id}`),
      }
    ).catch(() => undefined);
    return;
  }

  const demoted = user.role === Role.ADMIN;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role } }),
    // A former admin holds no CompanyAccess rows, so the store they had open
    // is no longer theirs to post into; clearing it makes them pick again.
    ...(demoted
      ? [
          prisma.user.updateMany({
            where: { id: user.id },
            data: { activeCompanyId: null },
          }),
        ]
      : []),
  ]);

  await logAction(
    ctx.user.id,
    "ROLE_CHANGED",
    `${user.name} · ${user.role} → ${role} · ${user.telegramId}`
  );

  // The user may have blocked the bot.
  await ctx.api
    .sendMessage(
      user.telegramId.toString(),
      t(user.language, "admin.roleChangedNotice", {
        role: roleLabel(user.language, role),
      })
    )
    .catch(() => undefined);

  await ctx.answerCallbackQuery(roleLabel(ctx.locale, role));
  await renderUserCard(ctx, user.id, true);

  // Demotion strands people who were never granted a store of their own.
  const hint =
    demoted && user._count.companies === 0 ? ctx.t("admin.grantStoresHint") : "";
  await ctx.reply(
    ctx.t("admin.roleChanged", {
      name: esc(user.name),
      role: roleLabel(ctx.locale, role),
    }) + hint,
    { parse_mode: "HTML" }
  );
}

adminFlow.callbackQuery(
  /^usrole:([^:]+):(CASHIER|ACCOUNTANT|ADMIN)$/,
  requireModule("ADMIN"),
  (ctx) => changeRole(ctx, ctx.match![1], ctx.match![2] as Role, false)
);

adminFlow.callbackQuery(
  /^usroleyes:([^:]+):(CASHIER|ACCOUNTANT|ADMIN)$/,
  requireModule("ADMIN"),
  (ctx) => changeRole(ctx, ctx.match![1], ctx.match![2] as Role, true)
);

// ---------- Restoring and deleting from the card ----------

adminFlow.callbackQuery(/^usrres:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const user = await prisma.user.findUnique({ where: { id: ctx.match![1] } });
  if (!user) {
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { status: UserStatus.ACTIVE },
  });

  await ctx.api
    .sendMessage(
      user.telegramId.toString(),
      t(user.language, "admin.accessRestoredNotice")
    )
    .catch(() => undefined);

  await logAction(
    ctx.user.id,
    "USER_ACCESS_RESTORED",
    `${user.name} · ${user.telegramId}`
  );
  await ctx.answerCallbackQuery(ctx.t("admin.btnRestore"));
  await renderUserCard(ctx, user.id, true);
});

/** The user a delete button points at, once it has earned the right to act. */
type DeletableUser = NonNullable<Awaited<ReturnType<typeof findDeletable>>>;

function findDeletable(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, credits: true } } },
  });
}

/**
 * Resolves the target of a delete button and refuses the two cases that must
 * never get through, whatever the screen said when it was drawn.
 */
async function resolveDeleteTarget(
  ctx: BotContext,
  id: string
): Promise<DeletableUser | null> {
  const user = await findDeletable(id);
  if (!user) {
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
    return null;
  }
  if (user.telegramId === BigInt(ctx.from!.id)) {
    await ctx.answerCallbackQuery({
      text: ctx.t("admin.cannotRemoveSelf"),
      show_alert: true,
    });
    return null;
  }
  return user;
}

/**
 * Asks for the second tap — or, when the person already has entries against
 * their name, offers a revoke instead. Financial records carry a required
 * author, so deleting them away is never on the table.
 */
async function renderDeletePrompt(ctx: BotContext, user: DeletableUser): Promise<void> {
  const hasHistory = user._count.transactions > 0 || user._count.credits > 0;
  const text = hasHistory
    ? ctx.t("admin.hasHistory", {
        name: esc(user.name),
        transactions: user._count.transactions,
        credits: user._count.credits,
      })
    : ctx.t("admin.confirmDelete", { name: esc(user.name) });

  const kb = new InlineKeyboard();
  if (!hasHistory) {
    kb.text(ctx.t("admin.btnConfirmDelete"), `usrdelyes:${user.id}`).row();
  } else if (user.status === UserStatus.ACTIVE) {
    kb.text(ctx.t("admin.revokeButton"), `revoke:${user.id}`).row();
  }
  kb.text(ctx.t("admin.btnBack"), `usr:${user.id}`);

  const options = { parse_mode: "HTML" as const, reply_markup: kb };
  await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
}

adminFlow.callbackQuery(/^usrdel:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const user = await resolveDeleteTarget(ctx, ctx.match![1]);
  if (!user) return;

  await ctx.answerCallbackQuery();
  await renderDeletePrompt(ctx, user);
});

adminFlow.callbackQuery(/^usrdelyes:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  const user = await resolveDeleteTarget(ctx, ctx.match![1]);
  if (!user) return;

  // An entry may have arrived between the two taps.
  if (user._count.transactions > 0 || user._count.credits > 0) {
    await ctx.answerCallbackQuery();
    await renderDeletePrompt(ctx, user);
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  await logAction(ctx.user.id, "USER_DELETED", `${user.name} · ${user.telegramId}`);

  await ctx.answerCallbackQuery(ctx.t("admin.btnDelete"));
  await ctx.editMessageText(ctx.t("admin.userRemoved", { name: esc(user.name) }), {
    parse_mode: "HTML",
  }).catch(() => undefined);
  await renderUserList(ctx, false);
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
  if (user.id === ctx.user.id) {
    await ctx.answerCallbackQuery({
      text: ctx.t("admin.cannotRemoveSelf"),
      show_alert: true,
    });
    return;
  }

  // The same two ways a system can lose its last way in as demotion does.
  if (user.role === Role.ADMIN) {
    if (bootstrapAdminIds().includes(user.telegramId)) {
      await ctx.answerCallbackQuery({
        text: ctx.t("admin.bootstrapLocked"),
        show_alert: true,
      });
      return;
    }

    const otherAdmins = await prisma.user.count({
      where: { role: Role.ADMIN, status: UserStatus.ACTIVE, id: { not: user.id } },
    });
    if (otherAdmins === 0) {
      await ctx.answerCallbackQuery({
        text: ctx.t("admin.lastAdmin"),
        show_alert: true,
      });
      return;
    }
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
  await renderUserCard(ctx, user.id, true);
  await ctx.reply(ctx.t("admin.accessRevokedFull", { name: esc(user.name) }), {
    parse_mode: "HTML",
  });
});
