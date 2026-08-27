import { Composer, InlineKeyboard } from "grammy";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction, requireModule } from "../auth";
import { labels, roleBadge, roleLabel, t } from "../i18n";
import { onePerRow } from "../helpers";
import { esc } from "../format";
import type { BotContext } from "../types";

/**
 * Admin-only: which stores each person may post to.
 *
 * This is the control that makes the isolation real. A cashier can only ever
 * switch between the stores granted here, so the wrong-store mistake stops
 * being possible rather than merely being discouraged.
 */
export const accessFlow = new Composer<BotContext>();

// ---------- Pick a user ----------

accessFlow.hears(labels("btn.access"), requireModule("ADMIN"), async (ctx) => {
  const users = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE, role: { not: Role.ADMIN } },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) {
    await ctx.reply(ctx.t("sacc.noUsers"));
    return;
  }

  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const user of users) {
    const granted = await prisma.companyAccess.count({ where: { userId: user.id } });
    addRow(`${roleBadge(ctx.locale, user.role)} ${user.name} · ${granted}`, `sacc:${user.id}`);
  }

  await ctx.reply(ctx.t("sacc.title"), { parse_mode: "HTML", reply_markup: kb });
});

// ---------- Toggle stores for that user ----------

/** The store list for one user, ticking the ones they already hold. */
async function renderUserAccess(ctx: BotContext, userId: string, edit: boolean) {
  const [user, stores, granted] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.companyAccess.findMany({ where: { userId }, select: { companyId: true } }),
  ]);

  if (!user) {
    await ctx.answerCallbackQuery(ctx.t("admin.userNotFound"));
    return;
  }
  if (user.role === Role.ADMIN) {
    await ctx.answerCallbackQuery({ text: ctx.t("sacc.adminAll"), show_alert: true });
    return;
  }
  if (stores.length === 0) {
    await ctx.answerCallbackQuery({ text: ctx.t("sacc.noStores"), show_alert: true });
    return;
  }

  const held = new Set(granted.map((row) => row.companyId));
  const kb = new InlineKeyboard();
  const addRow = onePerRow(kb);
  for (const store of stores) {
    const mark = held.has(store.id) ? "✅" : "➕";
    addRow(`${mark} ${store.name}`, `saccx:${user.id}:${store.id}`);
  }

  const text = ctx.t("sacc.user", {
    name: esc(user.name),
    role: roleLabel(ctx.locale, user.role),
  });
  const options = { parse_mode: "HTML" as const, reply_markup: kb };

  if (edit) {
    await ctx.editMessageText(text, options).catch(() => ctx.reply(text, options));
  } else {
    await ctx.reply(text, options);
  }
}

accessFlow.callbackQuery(/^sacc:(.+)$/, requireModule("ADMIN"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderUserAccess(ctx, ctx.match![1], true);
});

accessFlow.callbackQuery(
  /^saccx:([^:]+):(.+)$/,
  requireModule("ADMIN"),
  async (ctx) => {
    const [, userId, companyId] = ctx.match!;

    const [user, store] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.company.findUnique({ where: { id: companyId } }),
    ]);
    if (!user || !store) {
      await ctx.answerCallbackQuery(ctx.t("store.notFound"));
      return;
    }

    const existing = await prisma.companyAccess.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (existing) {
      // Revoking has to clear the selection too, otherwise the user keeps
      // posting into a store they no longer hold until they next switch.
      await prisma.$transaction([
        prisma.companyAccess.delete({
          where: { userId_companyId: { userId, companyId } },
        }),
        prisma.user.updateMany({
          where: { id: userId, activeCompanyId: companyId },
          data: { activeCompanyId: null },
        }),
      ]);

      await logAction(
        ctx.user.id,
        "STORE_ACCESS_REVOKED",
        `${user.name} · ${store.name}`,
        store.id
      );
      await notify(ctx, user.telegramId, user.language, "sacc.notifyRevoked", store.name);
      await ctx.answerCallbackQuery(ctx.t("sacc.revoked", { store: store.name }));
    } else {
      await prisma.companyAccess.create({
        data: { userId, companyId, grantedBy: ctx.user.id },
      });

      await logAction(
        ctx.user.id,
        "STORE_ACCESS_GRANTED",
        `${user.name} · ${store.name}`,
        store.id
      );
      await notify(ctx, user.telegramId, user.language, "sacc.notifyGranted", store.name);
      await ctx.answerCallbackQuery(ctx.t("sacc.granted", { store: store.name }));
    }

    await renderUserAccess(ctx, userId, true);
  }
);

/** Tells the user in their own language. They may have blocked the bot. */
async function notify(
  ctx: BotContext,
  telegramId: bigint,
  language: Parameters<typeof t>[0],
  key: "sacc.notifyGranted" | "sacc.notifyRevoked",
  store: string
): Promise<void> {
  await ctx.api
    .sendMessage(telegramId.toString(), t(language, key, { store: esc(store) }), {
      parse_mode: "HTML",
    })
    .catch(() => undefined);
}
