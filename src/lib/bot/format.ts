import { format } from "date-fns";
import type { Locale, Transaction } from "@prisma/client";
import { formatMoney, toNumber } from "@/lib/money";
import { categoryLabel, t } from "./i18n";

export const DATE_FMT = "dd.MM.yyyy";
export const DATETIME_FMT = "dd.MM.yyyy HH:mm";

export function fmtDate(date: Date): string {
  return format(date, DATE_FMT);
}

export function fmtDateTime(date: Date): string {
  return format(date, DATETIME_FMT);
}

/** Escapes text before it is interpolated into an HTML-parsed message. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Parses a user-typed date. Accepts `dd.MM.yyyy`, `dd/MM/yyyy` and `dd.MM`
 * (current year). Returns null when the date is not valid.
 */
export function parseDate(input: string): Date | null {
  const match = input.trim().match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;

  const date = new Date(year, month - 1, day, 12, 0, 0);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValid ? date : null;
}

const SIGN = { INCOME: "➕", EXPENSE: "➖" } as const;

function sourceLabel(locale: Locale, source: Transaction["source"]): string {
  return t(locale, source === "CASH" ? "common.cash" : "common.bank");
}

/** One-line summary used in lists. */
export function txLine(tx: Transaction, locale: Locale): string {
  const money = formatMoney(toNumber(tx.amount), tx.currency);
  return `${SIGN[tx.type]} ${money} · ${sourceLabel(locale, tx.source)} · ${fmtDate(tx.date)}`;
}

/** Full card shown after saving or when opening an entry. */
export function txCard(tx: Transaction, locale: Locale): string {
  const lines = [
    `${SIGN[tx.type]} <b>${formatMoney(toNumber(tx.amount), tx.currency)}</b>`,
    t(locale, "tx.source", { source: sourceLabel(locale, tx.source) }),
    t(locale, "tx.type", {
      type: t(locale, tx.type === "INCOME" ? "common.income" : "common.expense"),
    }),
    t(locale, "tx.date", { date: fmtDate(tx.date) }),
  ];
  if (tx.category) {
    lines.push(
      t(locale, "tx.category", { category: esc(categoryLabel(locale, tx.category)) })
    );
  }
  if (tx.bankName) lines.push(t(locale, "tx.bank", { bank: esc(tx.bankName) }));
  if (tx.counterparty) {
    lines.push(t(locale, "tx.counterparty", { counterparty: esc(tx.counterparty) }));
  }
  if (tx.comment) lines.push(t(locale, "tx.comment", { comment: esc(tx.comment) }));
  return lines.join("\n");
}
