import { Locale, Role } from "@prisma/client";
import type { MiddlewareFn } from "grammy";
import { prisma } from "@/lib/prisma";
import { bootstrapAdminIds } from "@/lib/env";
import { t, translator } from "./i18n";
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
 * Resolves the Telegram user to a registered `User` row and rejects everyone
 * else. Ids listed in `ADMIN_TELEGRAM_IDS` are auto-provisioned as ADMIN so
 * the owner can get in before any user exists.
 */
export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  const telegramId = BigInt(from.id);
  const displayName =
    [from.first_name, from.last_name].filter(Boolean).join(" ") ||
    from.username ||
    `User ${from.id}`;

  let user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user && bootstrapAdminIds().includes(telegramId)) {
    user = await prisma.user.create({
      data: {
        telegramId,
        name: displayName,
        role: Role.ADMIN,
        language: guessLocale(from.language_code),
      },
    });
  }

  if (!user) {
    // No stored preference yet, so fall back to the Telegram client's own
    // language for the one message this person is allowed to see.
    await ctx.reply(t(guessLocale(from.language_code), "auth.denied", { id: from.id }), {
      parse_mode: "HTML",
    });
    return;
  }

  ctx.user = user;
  ctx.role = user.role;
  ctx.locale = user.language;
  ctx.t = translator(user.language);
  await next();
};

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
