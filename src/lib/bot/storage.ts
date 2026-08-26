import type { StorageAdapter } from "grammy";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionData } from "./types";

/**
 * Persists wizard state in Postgres, keyed by Telegram chat id.
 *
 * The two halves of `SessionData` map onto the two columns of `bot_sessions`
 * so the table stays readable when inspected directly.
 */
export const prismaSessionStorage: StorageAdapter<SessionData> = {
  async read(key) {
    const row = await prisma.botSession.findUnique({
      where: { chatId: BigInt(key) },
    });
    if (!row) return undefined;
    return {
      step: row.step,
      draft: (row.data ?? {}) as Record<string, unknown>,
    };
  },

  async write(key, value) {
    const chatId = BigInt(key);
    const data = (value.draft ?? {}) as Prisma.InputJsonValue;
    await prisma.botSession.upsert({
      where: { chatId },
      create: { chatId, step: value.step, data },
      update: { step: value.step, data },
    });
  },

  async delete(key) {
    await prisma.botSession
      .delete({ where: { chatId: BigInt(key) } })
      .catch(() => undefined); // Already gone is not an error.
  },
};
