import { webhookCallback } from "grammy";
import { getBot } from "@/lib/bot";
import { webhookSecret } from "@/lib/env";

// Prisma and the bot both need Node APIs, and updates must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let handler: ((request: Request) => Promise<Response>) | undefined;

function getHandler() {
  if (!handler) {
    handler = webhookCallback(getBot(), "std/http", {
      secretToken: webhookSecret(),
      // Answer Telegram before the platform can time the function out, so a
      // slow update is not retried in a loop.
      timeoutMilliseconds: 50_000,
      onTimeout: "return",
    });
  }
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await getHandler()(request);
  } catch (error) {
    // Never surface a 500 to Telegram: it would retry the same update forever.
    console.error("[telegram-webhook] handler error", error);
    return new Response("ok", { status: 200 });
  }
}

/** Lets you confirm the route is deployed by opening it in a browser. */
export function GET(): Response {
  return Response.json({ ok: true, endpoint: "telegram-webhook" });
}
