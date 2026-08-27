import { webhookCallback } from "grammy";
import { revalidateTag } from "next/cache";
import { getBot } from "@/lib/bot";
import { webhookSecret } from "@/lib/env";
import { REPORTS_TAG } from "@/lib/reporting";

// Node.js and dynamic are the defaults under Cache Components.
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
    const response = await getHandler()(request);
    // Every bot update that reaches here may have written to the books. One
    // invalidation per update is cheaper than working out which handler ran,
    // and the dashboard serves the stale figures while the refresh happens.
    revalidateTag(REPORTS_TAG, "max");
    return response;
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
