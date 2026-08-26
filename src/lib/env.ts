/**
 * Centralised, lazily-read environment access.
 *
 * Values are read on call (not at module scope) so that importing this file
 * during `next build` does not fail when a variable is not yet configured.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function botToken(): string {
  return required("TELEGRAM_BOT_TOKEN");
}

export function webhookSecret(): string {
  return required("TELEGRAM_WEBHOOK_SECRET");
}

export function dashboardPassword(): string {
  return required("DASHBOARD_PASSWORD");
}

export function authSecret(): Uint8Array {
  return new TextEncoder().encode(required("AUTH_SECRET"));
}

/** Telegram ids that are always treated as ADMIN, used to bootstrap the system. */
export function bootstrapAdminIds(): bigint[] {
  return (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => BigInt(part));
}
