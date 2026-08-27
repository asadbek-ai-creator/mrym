import { InlineKeyboard, type MiddlewareFn } from "grammy";
import { Role, type Company, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { onePerRow } from "./helpers";
import { esc } from "./format";
import type { BotContext } from "./types";

/**
 * The active store: which set of books a user is currently posting to.
 *
 * The whole point of v2.1 is that a cashier never chooses a store while
 * entering an amount — they choose it once, deliberately, and everything they
 * type afterwards lands there. That makes the selection a piece of state the
 * bot must be certain about, which is why it lives in `users.activeCompanyId`
 * rather than in a session: serverless webhooks share no memory between two
 * updates, so a process-local "current store" would quietly reset mid-shift
 * and start filing entries somewhere else.
 */

/**
 * The stores this user may post to.
 *
 * Admins own the books and reach every store without being granted each one;
 * everyone else sees exactly what `CompanyAccess` says they may see.
 */
export async function accessibleStores(user: User): Promise<Company[]> {
  if (user.role === Role.ADMIN) {
    return prisma.company.findMany({ orderBy: { name: "asc" } });
  }

  const rows = await prisma.companyAccess.findMany({
    where: { userId: user.id },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });
  return rows.map((row) => row.company);
}

/** True when this user is allowed to post to `companyId`. */
export async function canUseStore(user: User, companyId: string): Promise<boolean> {
  if (user.role === Role.ADMIN) {
    return (await prisma.company.count({ where: { id: companyId } })) > 0;
  }
  const access = await prisma.companyAccess.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });
  return access !== null;
}

/** Marks the store the user is working in. Returns the store it switched to. */
export async function setActiveStore(
  userId: string,
  companyId: string
): Promise<Company> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { activeCompanyId: companyId },
    include: { activeCompany: true },
  });
  return updated.activeCompany!;
}

/** One button per store, with the active one ticked. */
export function storeKeyboard(
  stores: Company[],
  activeId: string | null
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const store of stores) {
    const mark = store.id === activeId ? "✅" : "🏬";
    addRow(`${mark} ${store.name}`, `store:${store.id}`);
  }
  return kb;
}

/**
 * Asks which store to work in. Answers with an explanation instead when the
 * user has not been assigned any, since there is nothing to choose from.
 */
export async function promptStoreChoice(ctx: BotContext): Promise<void> {
  const stores = await accessibleStores(ctx.user);

  if (stores.length === 0) {
    await ctx.reply(ctx.t("store.none"), { parse_mode: "HTML" });
    return;
  }

  const header = ctx.activeCompany
    ? `${ctx.t("store.current", { name: esc(ctx.activeCompany.name) })}\n\n${ctx.t("store.choose")}`
    : ctx.t("store.choose");

  await ctx.reply(header, {
    parse_mode: "HTML",
    reply_markup: storeKeyboard(stores, ctx.activeCompany?.id ?? null),
  });
}

/**
 * Guards everything that writes to the books.
 *
 * Without an active store there is no correct company to file an entry
 * against, so the wizard is refused outright rather than started and
 * abandoned halfway — a refusal the user can act on is better than a draft
 * that cannot be saved.
 */
export const requireActiveStore: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (ctx.activeCompany) {
    await next();
    return;
  }

  const stores = await accessibleStores(ctx.user);
  const text = stores.length === 0 ? ctx.t("store.none") : ctx.t("store.notSelected");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: stripTags(text), show_alert: true });
  } else {
    await ctx.reply(text, { parse_mode: "HTML" });
    if (stores.length > 0) await promptStoreChoice(ctx);
  }
};

/** Callback answers are plain text, so HTML markup has to come back out. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** The "Store: X" line every wizard puts above its first question. */
export function storeLine(ctx: BotContext): string {
  return ctx.t("store.current", { name: esc(ctx.activeCompany!.name) });
}
