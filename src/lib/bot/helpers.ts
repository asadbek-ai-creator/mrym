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

/**
 * Returns an "add one button on its own row" function.
 *
 * Calling `.row()` after every button leaves a trailing empty row in the
 * serialised markup, so the separator is emitted before each button except
 * the first instead.
 */
export function onePerRow(kb: InlineKeyboard) {
  let first = true;
  return (label: string, data: string) => {
    if (!first) kb.row();
    first = false;
    kb.text(label, data);
  };
}

export function resetSession(ctx: BotContext): void {
  ctx.session.step = null;
  ctx.session.draft = {};
}

/** Ends a wizard: clears state and puts the main menu back on screen. */
export async function finish(ctx: BotContext, text: string): Promise<void> {
  resetSession(ctx);
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: mainMenu(ctx.role, ctx.locale),
  });
}

/** Inline actions attached to a freshly saved or opened entry. */
export function entryActions(tx: Transaction, ctx: BotContext): InlineKeyboard {
  return new InlineKeyboard()
    .text(ctx.t("entry.btnAmount"), `txamt:${tx.id}`)
    .text(ctx.t("entry.btnComment"), `txcom:${tx.id}`)
    .row()
    .text(ctx.t("entry.btnDelete"), `txdel:${tx.id}`);
}

/** Confirmation shown once an entry has been written. */
export async function replySaved(ctx: BotContext, tx: Transaction): Promise<void> {
  resetSession(ctx);
  await ctx.reply(`${ctx.t("common.saved")}\n\n${txCard(tx, ctx.locale)}`, {
    parse_mode: "HTML",
    reply_markup: entryActions(tx, ctx),
  });
  await ctx.reply(ctx.t("common.next"), {
    reply_markup: mainMenu(ctx.role, ctx.locale),
  });
}

/**
 * Removes the inline keyboard from the message a callback came from, so a
 * finished step cannot be answered twice.
 */
export async function clearInlineKeyboard(ctx: BotContext): Promise<void> {
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
}
