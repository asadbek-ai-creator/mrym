import type { Context, SessionFlavor } from "grammy";
import type { Company, Locale, Role, User } from "@prisma/client";
import type { Translate } from "./i18n";

/**
 * The wizard state. Because the bot runs on serverless webhooks there is no
 * in-memory state between updates: `step` names the prompt the user is
 * currently answering and `draft` holds what has been collected so far.
 */
export interface SessionData {
  step: string | null;
  draft: Record<string, unknown>;
}

export function initialSession(): SessionData {
  return { step: null, draft: {} };
}

/** Added by the auth middleware; always present in guarded handlers. */
export interface AuthFlavor {
  user: User;
  role: Role;
  /**
   * The store this user is posting to, re-read from the database on every
   * update. Null when none is selected or the selected one is no longer
   * reachable — handlers that write must sit behind `requireActiveStore`.
   */
  activeCompany: Company | null;
  /** The user's chosen interface language. */
  locale: Locale;
  /** Translator bound to `locale`; every user-facing string goes through it. */
  t: Translate;
}

export type BotContext = Context & SessionFlavor<SessionData> & AuthFlavor;
