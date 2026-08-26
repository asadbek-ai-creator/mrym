import type { Currency } from "@prisma/client";

/**
 * Parses a human-typed amount, optionally carrying a currency.
 *
 * Accepts the shapes people actually type on a phone keyboard:
 *   "1000000", "1 000 000", "1'000'000", "1.000.000", "1,000,000"
 *   "1500,50", "1500.50", "500 USD", "$500", "500$"
 *
 * Returns null when the input is not a positive amount.
 */
export function parseAmount(
  input: string
): { amount: number; currency: Currency } | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;

  let currency: Currency = "UZS";
  if (text.includes("$") || /\busd\b/.test(text)) {
    currency = "USD";
  } else if (/\b(uzs|sum|so'm|som)\b/.test(text)) {
    currency = "UZS";
  }

  // Drop the currency markers and any grouping characters.
  text = text
    .replace(/\$|usd|uzs|sum|so'm|som/g, "")
    .replace(/[\s'’_]/g, "");

  if (!text) return null;

  // Normalise separators. The last separator is a decimal point only when it
  // is followed by one or two digits and is the only one of its kind;
  // everything else is thousands grouping.
  const lastSep = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
  if (lastSep !== -1) {
    const decimals = text.length - lastSep - 1;
    const sepChar = text[lastSep];
    const sepCount = text.split(sepChar).length - 1;
    const isDecimalPoint = decimals >= 1 && decimals <= 2 && sepCount === 1;
    if (isDecimalPoint) {
      text = text.slice(0, lastSep).replace(/[.,]/g, "") + "." + text.slice(lastSep + 1);
    } else {
      text = text.replace(/[.,]/g, "");
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return { amount: Math.round(amount * 100) / 100, currency };
}

const formatters: Record<Currency, Intl.NumberFormat> = {
  UZS: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/** Formats an amount for display, e.g. `1 500 000 UZS`. */
export function formatMoney(
  amount: number | string,
  currency: Currency = "UZS"
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const formatted = formatters[currency].format(value).replace(/,/g, " ");
  return `${formatted} ${currency}`;
}

/**
 * Short form for axis ticks, where UZS figures run into the billions and the
 * full number would collide with its neighbours.
 */
export function formatCompact(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const value = Math.abs(amount);

  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size;
      const digits = scaled < 10 ? 1 : 0;
      return `${sign}${scaled.toFixed(digits)}${suffix}`;
    }
  }
  return `${sign}${Math.round(value)}`;
}

/** Converts a Prisma `Decimal` (or anything stringifiable) to a plain number. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}
