import { InlineKeyboard, Keyboard } from "grammy";
import { Locale, Role, TxType } from "@prisma/client";
import { can } from "./auth";
import {
  CASH_CATEGORIES,
  LOCALES,
  LOCALE_LABEL,
  categoryLabel,
  labels,
  t,
} from "./i18n";

export { CASH_CATEGORIES, labels };

/**
 * Menu labels are rendered in the user's language but matched in every
 * language, because a keyboard already on screen keeps its old labels after
 * a language switch.
 */
export function mainMenu(role: Role, locale: Locale): Keyboard {
  const label = (key: Parameters<typeof t>[1]) => t(locale, key);

  const kb = new Keyboard()
    .text(label("btn.cashIncome"))
    .text(label("btn.cashExpense"))
    .row();

  if (can(role, "BANK")) {
    kb.text(label("btn.bankIncome")).text(label("btn.bankExpense")).row();
  }
  if (can(role, "CREDIT")) {
    kb.text(label("btn.addCredit")).text(label("btn.credits")).row();
  }

  kb.text(label("btn.myEntries")).text(label("btn.balance")).row();
  kb.text(label("btn.exportExcel")).text(label("btn.language"));

  if (can(role, "ADMIN")) {
    kb.row().text(label("btn.logs")).text(label("btn.users"));
    kb.row().text(label("btn.requests"));
  }

  return kb.resized().persistent();
}

/** Shown while a wizard is running so the user always has a way out. */
export function cancelMenu(locale: Locale): Keyboard {
  return new Keyboard().text(t(locale, "btn.cancel")).resized();
}

// ---------- Cash categories ----------

export function categoryKeyboard(type: TxType, locale: Locale): InlineKeyboard {
  const kb = new InlineKeyboard();
  CASH_CATEGORIES[type].forEach((category, index) => {
    kb.text(categoryLabel(locale, category), `cat:${index}`);
    if (index % 2 === 1) kb.row();
  });
  return kb;
}

/** Resolves a `cat:<index>` callback back to the stored category name. */
export function categoryFromIndex(type: TxType, index: number): string | null {
  return CASH_CATEGORIES[type][index] ?? null;
}

// ---------- Small shared keyboards ----------

export const skipKeyboard = (data: string, locale: Locale) =>
  new InlineKeyboard().text(t(locale, "btn.skip"), data);

export function dateKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(locale, "bank.today"), "date:today")
    .text(t(locale, "bank.yesterday"), "date:yesterday")
    .row()
    .text(t(locale, "bank.manualDate"), "date:manual");
}

export function languageKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  // One language per row, without leaving a trailing empty row behind.
  LOCALES.forEach((locale, index) => {
    if (index > 0) kb.row();
    kb.text(LOCALE_LABEL[locale], `lang:${locale}`);
  });
  return kb;
}
