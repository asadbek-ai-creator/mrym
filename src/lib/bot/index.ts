import { Bot, GrammyError, HttpError, session } from "grammy";
import { botToken } from "@/lib/env";
import { authMiddleware, can, logAction } from "./auth";
import { prismaSessionStorage } from "./storage";
import { initialSession, type BotContext, type SessionData } from "./types";
import { BTN, mainMenu } from "./keyboards";
import { resetSession } from "./helpers";
import { cashFlow } from "./flows/cash";
import { bankFlow } from "./flows/bank";
import { creditFlow } from "./flows/credit";
import { entriesFlow } from "./flows/entries";
import { reportsFlow } from "./flows/reports";
import { adminFlow } from "./flows/admin";

const MENU_LABELS = new Set<string>(Object.values(BTN));

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

  // 2. Everything past this point requires a registered user.
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
    const sections = ["💵 Cash"];
    if (can(ctx.role, "BANK")) sections.push("🏦 Bank");
    if (can(ctx.role, "CREDIT")) sections.push("💳 Credits");
    if (can(ctx.role, "ADMIN")) sections.push("🧾 Logs and users");

    await logAction(ctx.user.id, "BOT_START");
    await ctx.reply(
      `👋 Hello, <b>${ctx.user.name}</b>!\n\n` +
        `Your role: <b>${ctx.role}</b>\n` +
        `Available sections: ${sections.join(", ")}\n\n` +
        "Choose an action from the menu below.",
      { parse_mode: "HTML", reply_markup: mainMenu(ctx.role) }
    );
  });

  bot.command("menu", (ctx) =>
    ctx.reply("Menu:", { reply_markup: mainMenu(ctx.role) })
  );

  bot.command("id", (ctx) =>
    ctx.reply(`Your Telegram ID: <code>${ctx.from!.id}</code>`, {
      parse_mode: "HTML",
    })
  );

  bot.command("cancel", (ctx) =>
    ctx.reply("Cancelled.", { reply_markup: mainMenu(ctx.role) })
  );

  bot.hears(BTN.cancel, (ctx) =>
    ctx.reply("Cancelled.", { reply_markup: mainMenu(ctx.role) })
  );

  // 5. Feature flows. Each one owns its entry buttons, wizard steps and
  //    callback prefixes, and lets anything it does not recognise pass through.
  bot.use(cashFlow);
  bot.use(bankFlow);
  bot.use(creditFlow);
  bot.use(entriesFlow);
  bot.use(reportsFlow);
  bot.use(adminFlow);

  // 6. Anything unrecognised.
  bot.on("message", (ctx) =>
    ctx.reply("Please choose an action from the menu.", {
      reply_markup: mainMenu(ctx.role),
    })
  );

  bot.on("callback_query", (ctx) =>
    ctx.answerCallbackQuery("This button is no longer active.")
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

    await ctx
      .reply("⚠️ Something went wrong. Please try again or press /start.")
      .catch(() => undefined);
  });

  return bot;
}

let instance: Bot<BotContext> | undefined;

/** Reuses one bot across warm serverless invocations. */
export function getBot(): Bot<BotContext> {
  if (!instance) instance = createBot();
  return instance;
}
