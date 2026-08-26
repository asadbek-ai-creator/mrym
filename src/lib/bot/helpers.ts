import { Composer, InlineKeyboard, type Middleware } from "grammy";
import type { Transaction } from "@prisma/client";
import { mainMenu } from "./keyboards";
import type { BotContext } from "./types";
import { txCard } from "./format";

/**
 * Registers a text handler that only fires while the session sits on `step`.
 * Pass a prefix ending in `:` to match a family of steps.
 */
export function onStep(
  composer: Composer<BotContext>,
  step: string,
  handler: Middleware<BotContext>
): void {
  composer
    .on("message:text")
    .filter((ctx) => {
      const current = ctx.session.step;
      return current === step || (step.endsWith(":") && !!current?.startsWith(step));
    }, handler as never);
}

export function resetSession(ctx: BotContext): void {
  ctx.session.step = null;
  ctx.session.draft = {};
}

/** Ends a wizard: clears state and puts the main menu back on screen. */
export async function finish(ctx: BotContext, text: string): Promise<void> {
  resetSession(ctx);
  await ctx.reply(text, { reply_markup: mainMenu(ctx.role) });
}

/** Inline actions attached to a freshly saved or opened entry. */
export function entryActions(tx: Transaction): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Amount", `txamt:${tx.id}`)
    .text("📝 Comment", `txcom:${tx.id}`)
    .row()
    .text("🗑 Delete", `txdel:${tx.id}`);
}

/** Confirmation shown once an entry has been written. */
export async function replySaved(ctx: BotContext, tx: Transaction): Promise<void> {
  resetSession(ctx);
  await ctx.reply("✅ <b>Saved</b>\n\n" + txCard(tx), {
    parse_mode: "HTML",
    reply_markup: entryActions(tx),
  });
  await ctx.reply("Choose the next action:", {
    reply_markup: mainMenu(ctx.role),
  });
}

/**
 * Removes the inline keyboard from the message a callback came from, so a
 * finished step cannot be answered twice.
 */
export async function clearInlineKeyboard(ctx: BotContext): Promise<void> {
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
}
