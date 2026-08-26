import { Locale, Role, UserStatus, type User } from "@prisma/client";
import { InlineKeyboard, type MiddlewareFn } from "grammy";
import { prisma } from "@/lib/prisma";
import { bootstrapAdminIds } from "@/lib/env";
import { t, translator } from "./i18n";
import { esc } from "./format";
import type { BotContext } from "./types";

/** Modules of the system, used for permission checks. */
export type Module = "CASH" | "BANK" | "CREDIT" | "ADMIN";

const PERMISSIONS: Record<Role, Module[]> = {
  ADMIN: ["CASH", "BANK", "CREDIT", "ADMIN"],
  ACCOUNTANT: ["CASH", "BANK", "CREDIT"],
  CASHIER: ["CASH"],
};

export function can(role: Role, module: Module): boolean {
  return PERMISSIONS[role].includes(module);
}

/** Entries stay editable by their author for this long after creation. */
export const EDIT_WINDOW_MS = 30 * 60 * 1000;

export function withinEditWindow(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() < EDIT_WINDOW_MS;
}

/**
 * Resolves the Telegram user and decides whether they may go any further.
 *
 * Anyone may talk to the bot, but a first contact only files an access
 * request: the row is created PENDING, which carries no permissions, and the
 * admins are notified so a human makes the decision. Ids listed in
 * `ADMIN_TELEGRAM_IDS` are provisioned — and repaired — as active admins, so
 * the owner can never lock themselves out.
 */
export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  const telegramId = BigInt(from.id);
  const displayName =
    [from.first_name, from.last_name].filter(Boolean).join(" ") ||
    from.username ||
    `User ${from.id}`;
  const isBootstrapAdmin = bootstrapAdminIds().includes(telegramId);

  let user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        name: displayName,
        role: isBootstrapAdmin ? Role.ADMIN : Role.CASHIER,
        status: isBootstrapAdmin ? UserStatus.ACTIVE : UserStatus.PENDING,
        language: guessLocale(from.language_code),
      },
    });

    if (!isBootstrapAdmin) {
      await logAction(user.id, "ACCESS_REQUESTED", `${displayName} · ${telegramId}`);
      await notifyAdminsOfRequest(ctx, user, from.username);
      await ctx.reply(
        t(user.language, "access.requestSent", {
          name: esc(displayName),
          id: from.id,
        }),
        { parse_mode: "HTML" }
      );
      return;
    }
  } else if (isBootstrapAdmin && user.status !== UserStatus.ACTIVE) {
    // Self-healing: the owner stays reachable even if their row was left
    // pending by a migration or revoked by mistake.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ACTIVE, role: Role.ADMIN },
    });
  }

  if (user.status !== UserStatus.ACTIVE) {
    const key =
      user.status === UserStatus.PENDING ? "access.pending" : "access.rejected";
    await ctx.reply(t(user.language, key, { id: from.id }), { parse_mode: "HTML" });
    return;
  }

  ctx.user = user;
  ctx.role = user.role;
  ctx.locale = user.language;
  ctx.t = translator(user.language);
  await next();
};

/**
 * Pushes a new request to every active admin. Admins who have never opened
 * the bot cannot be messaged, so a failure here must not break the request.
 */
async function notifyAdminsOfRequest(
  ctx: BotContext,
  applicant: User,
  username: string | undefined
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
  });

  for (const admin of admins) {
    const keyboard = new InlineKeyboard()
      .text(t(admin.language, "req.asCashier"), `appr:${applicant.id}:CASHIER`)
      .text(t(admin.language, "req.asAccountant"), `appr:${applicant.id}:ACCOUNTANT`)
      .row()
      .text(t(admin.language, "req.reject"), `rej:${applicant.id}`);

    await ctx.api
      .sendMessage(
        admin.telegramId.toString(),
        t(admin.language, "req.newRequest", {
          name: esc(applicant.name),
          id: applicant.telegramId.toString(),
          username: username ? `\n@${esc(username)}` : "",
        }),
        { parse_mode: "HTML", reply_markup: keyboard }
      )
      .catch(() => undefined);
  }
}

/** Maps a Telegram `language_code` onto a language the bot actually speaks. */
export function guessLocale(code: string | undefined): Locale {
  return code?.toLowerCase().startsWith("en") ? Locale.EN : Locale.RU;
}

/** Guards a set of handlers behind a module permission. */
export function requireModule(module: Module): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!can(ctx.role, module)) {
      const text = ctx.t("common.noAccess");
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: true });
      else await ctx.reply(text);
      return;
    }
    await next();
  };
}

/** Appends an entry to the audit trail shown on the dashboard. */
export async function logAction(
  userId: string | null,
  action: string,
  details?: string
): Promise<void> {
  await prisma.actionLog.create({ data: { userId, action, details } });
}
