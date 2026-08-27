import { Bot, GrammyError, HttpError, session } from "grammy";
import { Locale } from "@prisma/client";
import { botToken } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { authMiddleware, can, logAction } from "./auth";
import { prismaSessionStorage } from "./storage";
import { initialSession, type BotContext, type SessionData } from "./types";
import { languageKeyboard, mainMenu } from "./keyboards";
import { allMenuLabels, labels, roleLabel, translator } from "./i18n";
import { resetSession } from "./helpers";
import { accessibleStores, promptStoreChoice, setActiveStore } from "./stores";
import { esc } from "./format";
import { cashFlow } from "./flows/cash";
import { bankFlow } from "./flows/bank";
import { creditFlow } from "./flows/credit";
import { entriesFlow } from "./flows/entries";
import { reportsFlow } from "./flows/reports";
import { adminFlow } from "./flows/admin";
import { companiesFlow } from "./flows/companies";
import { accessFlow } from "./flows/access";
import { regularFlow } from "./flows/regular";

const MENU_LABELS = allMenuLabels();

function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(botToken(), {
    // Set TELEGRAM_API_ROOT to point the bot at a local Bot API server, which
    // is how the flows can be exercised without a live Telegram chat.
    client: { apiRoot: process.env.TELEGRAM_API_ROOT || undefined },
  });

  // 1. Wizard state, persisted in Postgres because webhooks are stateless.
  bot.use(
    session<SessionData, BotContext>({
      initial: initialSession,
      storage: prismaSessionStorage,
    })
  );

  // 2. Everything past this point requires a registered user, and carries
  //    that user's language on the context.
  bot.use(authMiddleware);

  // 3. Pressing a menu button or sending a command always abandons the
  //    wizard in progress, so a user can never get stuck mid-flow.
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (MENU_LABELS.has(text) || text.startsWith("/")) {
      resetSession(ctx);
    }
    await next();
  });

  // 4. Commands.
  bot.command("start", async (ctx) => {
    const sections = [ctx.t("start.section.cash")];
    if (can(ctx.role, "BANK")) sections.push(ctx.t("start.section.bank"));
    if (can(ctx.role, "CREDIT")) sections.push(ctx.t("start.section.credits"));
    if (can(ctx.role, "ADMIN")) sections.push(ctx.t("start.section.admin"));

    await logAction(ctx.user.id, "BOT_START", undefined, ctx.activeCompany?.id);
    await ctx.reply(
      ctx.t("start.greeting", {
        name: ctx.user.name,
        role: roleLabel(ctx.locale, ctx.role),
        sections: sections.join(", "),
      }),
      { parse_mode: "HTML", reply_markup: mainMenu(ctx.role, ctx.locale) }
    );
    await promptStoreChoice(ctx);
  });

  // Switching stores is deliberate and always available.
  bot.hears(labels("btn.changeStore"), promptStoreChoice);
  bot.command("store", promptStoreChoice);

  bot.callbackQuery(/^store:(.+)$/, async (ctx) => {
    const companyId = ctx.match![1];

    // Re-derive what this user may reach instead of trusting the button: the
    // keyboard may have been sitting on screen since before access changed.
    const stores = await accessibleStores(ctx.user);
    const target = stores.find((store) => store.id === companyId);
    if (!target) {
      await ctx.answerCallbackQuery({
        text: ctx.t("store.noAccess"),
        show_alert: true,
      });
      return;
    }

    if (ctx.activeCompany?.id === target.id) {
      await ctx.answerCallbackQuery(
        ctx.t("store.unchanged", { name: target.name })
      );
      return;
    }

    const store = await setActiveStore(ctx.user.id, target.id);
    ctx.activeCompany = store;

    await logAction(ctx.user.id, "STORE_SWITCHED", store.name, store.id);
    await ctx.answerCallbackQuery(store.name);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(ctx.t("store.active", { name: esc(store.name) }), {
      parse_mode: "HTML",
      reply_markup: mainMenu(ctx.role, ctx.locale),
    });
  });

  bot.command("menu", (ctx) =>
    ctx.reply(ctx.t("common.menu"), {
      reply_markup: mainMenu(ctx.role, ctx.locale),
    })
  );

  bot.command("id", (ctx) =>
    ctx.reply(ctx.t("auth.yourId", { id: ctx.from!.id }), { parse_mode: "HTML" })
  );

  bot.command("cancel", (ctx) =>
    ctx.reply(ctx.t("common.cancelled"), {
      reply_markup: mainMenu(ctx.role, ctx.locale),
    })
  );

  bot.hears(labels("btn.cancel"), (ctx) =>
    ctx.reply(ctx.t("common.cancelled"), {
      reply_markup: mainMenu(ctx.role, ctx.locale),
    })
  );

  // 5. Language switching. The reply keyboard is rebuilt afterwards so the
  //    buttons on screen match the language that was just chosen.
  const askLanguage = (ctx: BotContext) =>
    ctx.reply(ctx.t("lang.choose"), { reply_markup: languageKeyboard() });

  bot.command("language", askLanguage);
  bot.hears(labels("btn.language"), askLanguage);

  bot.callbackQuery(/^lang:(RU|EN)$/, async (ctx) => {
    const locale = ctx.match![1] as Locale;

    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { language: locale },
    });
    ctx.locale = locale;
    ctx.t = translator(locale);

    await logAction(ctx.user.id, "LANGUAGE_CHANGED", locale);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(ctx.t("lang.changed"), {
      reply_markup: mainMenu(ctx.role, locale),
    });
  });

  // 6. Feature flows. Each one owns its entry buttons, wizard steps and
  //    callback prefixes, and lets anything it does not recognise pass through.
  bot.use(cashFlow);
  bot.use(bankFlow);
  bot.use(creditFlow);
  bot.use(entriesFlow);
  bot.use(reportsFlow);
  bot.use(adminFlow);
  bot.use(companiesFlow);
  bot.use(accessFlow);
  bot.use(regularFlow);

  // 7. Anything unrecognised.
  bot.on("message", (ctx) =>
    ctx.reply(ctx.t("common.chooseFromMenu"), {
      reply_markup: mainMenu(ctx.role, ctx.locale),
    })
  );

  bot.on("callback_query", (ctx) =>
    ctx.answerCallbackQuery(ctx.t("common.buttonExpired"))
  );

  bot.catch(async ({ ctx, error }) => {
    const description =
      error instanceof GrammyError
        ? `Telegram API: ${error.description}`
        : error instanceof HttpError
          ? `Network: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);

    console.error("[bot] update failed", ctx.update.update_id, description);

    // `ctx.t` is missing when the failure happened before auth ran.
    const text = ctx.t?.("common.error") ?? "⚠️ Error. Press /start.";
    await ctx.reply(text).catch(() => undefined);
  });

  return bot;
}

let instance: Bot<BotContext> | undefined;

/** Reuses one bot across warm serverless invocations. */
export function getBot(): Bot<BotContext> {
  if (!instance) instance = createBot();
  return instance;
}
