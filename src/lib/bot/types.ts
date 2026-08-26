import type { Context, SessionFlavor } from "grammy";
import type { Role, User } from "@prisma/client";

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
}

export type BotContext = Context & SessionFlavor<SessionData> & AuthFlavor;
