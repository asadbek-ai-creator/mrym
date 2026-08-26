import { getBot } from "@/lib/bot";
import { webhookSecret } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot webhook registration.
 *
 * Open `/api/telegram-webhook/setup?secret=<TELEGRAM_WEBHOOK_SECRET>` once
 * after deploying; it points Telegram at this deployment and reports the
 * resulting webhook info. Guarded by the same secret as the webhook itself.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.searchParams.get("secret") !== webhookSecret()) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const webhookUrl = `${url.origin}/api/telegram-webhook`;
  const bot = getBot();

  await bot.api.setWebhook(webhookUrl, {
    secret_token: webhookSecret(),
    drop_pending_updates: url.searchParams.get("drop") === "1",
    allowed_updates: ["message", "callback_query"],
  });

  const info = await bot.api.getWebhookInfo();
  return Response.json({ ok: true, webhookUrl, info });
}
