import { InlineKeyboard, Keyboard } from "grammy";
import { Role, TxType } from "@prisma/client";
import { can } from "./auth";

// ---------- Button labels (also used to match incoming reply-keyboard text) ----------

export const BTN = {
  cashIncome: "📥 Cash Income",
  cashExpense: "📤 Cash Expense",
  bankIncome: "🏦 Bank Income",
  bankExpense: "🏦 Bank Expense",
  addCredit: "💳 Add Credit",
  credits: "📋 Credits",
  myEntries: "📝 My Entries",
  balance: "📊 Balance",
  exportExcel: "📁 Export Excel",
  logs: "🧾 Logs",
  users: "👥 Users",
  cancel: "❌ Cancel",
} as const;

export function mainMenu(role: Role): Keyboard {
  const kb = new Keyboard().text(BTN.cashIncome).text(BTN.cashExpense).row();

  if (can(role, "BANK")) {
    kb.text(BTN.bankIncome).text(BTN.bankExpense).row();
  }
  if (can(role, "CREDIT")) {
    kb.text(BTN.addCredit).text(BTN.credits).row();
  }

  kb.text(BTN.myEntries).text(BTN.balance).row();
  kb.text(BTN.exportExcel);

  if (can(role, "ADMIN")) {
    kb.row().text(BTN.logs).text(BTN.users);
  }

  return kb.resized().persistent();
}

/** Shown while a wizard is running so the user always has a way out. */
export function cancelMenu(): Keyboard {
  return new Keyboard().text(BTN.cancel).resized();
}

// ---------- Cash categories ----------

export const CASH_CATEGORIES: Record<TxType, string[]> = {
  INCOME: ["Sales", "Advance", "Debt repayment", "Investment", "Other"],
  EXPENSE: [
    "Supplies",
    "Salary",
    "Rent",
    "Utilities",
    "Transport",
    "Taxes",
    "Other",
  ],
};

export function categoryKeyboard(type: TxType): InlineKeyboard {
  const kb = new InlineKeyboard();
  CASH_CATEGORIES[type].forEach((category, index) => {
    kb.text(category, `cat:${index}`);
    if (index % 2 === 1) kb.row();
  });
  return kb;
}

/** Resolves a `cat:<index>` callback back to the category name. */
export function categoryFromIndex(type: TxType, index: number): string | null {
  return CASH_CATEGORIES[type][index] ?? null;
}

// ---------- Small shared keyboards ----------

export const skipKeyboard = (data: string) =>
  new InlineKeyboard().text("⏭ Skip", data);

export function dateKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📅 Today", "date:today")
    .text("📅 Yesterday", "date:yesterday")
    .row()
    .text("✏️ Enter a date", "date:manual");
}

export function confirmKeyboard(yes: string, no: string): InlineKeyboard {
  return new InlineKeyboard().text("✅ Yes", yes).text("↩️ No", no);
}
