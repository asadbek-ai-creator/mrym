import { Composer, InlineKeyboard } from "grammy";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction, requireModule } from "../auth";
import { cancelMenu } from "../keyboards";
import { labels } from "../i18n";
import { finish, onStep } from "../helpers";
import { esc } from "../format";
import type { BotContext } from "../types";

/**
 * Store management, admin only.
 *
 * Stores are the tenants every financial record hangs off, so one has to exist
 * — and be granted to someone in the access screen — before anything can be
 * recorded. This is where they come from.
 */
export const companiesFlow = new Composer<BotContext>();

const NAME_MIN = 2;
const NAME_MAX = 60;

companiesFlow.hears(labels("btn.companies"), requireModule("ADMIN"), async (ctx) => {
  const companies = await prisma.company.findMany({ orderBy: { name: "asc" } });

  const lines = [ctx.t("company.title"), ""];
  if (companies.length === 0) {
    lines.push(ctx.t("company.listEmpty"));
  } else {
    for (const company of companies) lines.push(`🏢 ${esc(company.name)}`);
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(ctx.t("company.btnAdd"), "coadd"),
  });
});

companiesFlow.callbackQuery("coadd", requireModule("ADMIN"), async (ctx) => {
  ctx.session.step = "company:name";
  ctx.session.draft = {};
  await ctx.answerCallbackQuery();
  await ctx.reply(ctx.t("company.askName"), {
    reply_markup: cancelMenu(ctx.locale),
  });
});

onStep(companiesFlow, "company:name", async (ctx) => {
  const name = ctx.message!.text!.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    await ctx.reply(ctx.t("company.badName"));
    return;
  }

  try {
    const company = await prisma.company.create({ data: { name } });
    await logAction(ctx.user.id, "COMPANY_CREATED", name, company.id);
    await finish(ctx, ctx.t("company.added", { name: esc(company.name) }));
  } catch (error) {
    // The name is unique, so a clash is a user mistake rather than a fault.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await ctx.reply(ctx.t("company.exists"));
      return;
    }
    throw error;
  }
});
