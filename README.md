# Financial Accounting System

A Telegram bot for data entry plus an admin web dashboard for reporting, sharing
one PostgreSQL database. Built to run on Vercel as serverless functions.

- **Bot** — cash, bank and credit entry via standard reply/inline keyboards.
  No Telegram Mini Apps.
- **Dashboard** — `/dashboard`, password protected, shows balances, net margin,
  charts and the audit trail.

## Stack

Next.js 16 (App Router) · Prisma + PostgreSQL (Neon) · grammY · Tailwind CSS 4 ·
Recharts · `xlsx-js-style`

## Roles

| Role | Cash | Bank | Credits | Logs / users | Dashboard |
| --- | --- | --- | --- | --- | --- |
| `CASHIER` | ✅ | — | — | — | — |
| `ACCOUNTANT` | ✅ | ✅ | ✅ | — | — |
| `ADMIN` | ✅ | ✅ | ✅ | ✅ | ✅ |

Access is granted by Telegram user ID. Anyone not in the `users` table is
refused and shown their own ID to pass to an admin. IDs listed in
`ADMIN_TELEGRAM_IDS` are auto-provisioned as `ADMIN` on first contact, which is
how the first owner gets in. After that, admins add people from the bot's
**👥 Users** screen.

Entry authors can correct their own amount/comment, or delete an entry, for 30
minutes after creating it (`EDIT_WINDOW_MS` in `src/lib/bot/auth.ts`).

## Net margin

```
Net margin = (cash income + bank income)
           − (cash expense + bank expense + credit instalments marked paid)
```

Balances and margin are computed per currency (UZS and USD are never summed
together) in `src/lib/reporting.ts`.

## Environment

Copy `.env.example` to `.env` and fill it in:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (use the **pooled** Neon URL) |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | Long random string; guards the webhook and the setup route |
| `ADMIN_TELEGRAM_IDS` | Comma-separated bootstrap admin IDs |
| `DASHBOARD_PASSWORD` | Password for the dashboard login screen |
| `AUTH_SECRET` | Long random string; signs the session cookie |

Generate the two random secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

## Local development

```bash
npm install
npx prisma db push      # create the tables
npx prisma generate
npm run dev
```

The dashboard is at http://localhost:3000/dashboard.

Telegram cannot reach `localhost`, so to exercise the bot locally either expose
the port with a tunnel (`ngrok http 3000`) and register that URL, or set
`TELEGRAM_API_ROOT` to a local Bot API stand-in and POST synthetic updates to
`/api/telegram-webhook` with the `X-Telegram-Bot-Api-Secret-Token` header.

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add every variable from the table above under **Settings → Environment
   Variables** (Production **and** Preview).
3. Deploy.
4. Register the webhook once, from a browser:

   ```
   https://<your-app>.vercel.app/api/telegram-webhook/setup?secret=<TELEGRAM_WEBHOOK_SECRET>
   ```

   It responds with Telegram's `getWebhookInfo`; `"url"` should be your
   deployment and `"last_error_message"` should be absent. Append `&drop=1` to
   discard updates queued while the bot was down.
5. Open the bot in Telegram and send `/start`.

Re-run step 4 after any change to the deployment URL.

## Layout

```
prisma/schema.prisma           Users, transactions, credits, logs, bot sessions
src/app/api/telegram-webhook/  Webhook entry point + one-shot setup route
src/app/dashboard/             Admin dashboard (server component + charts)
src/app/login/                 Password login
src/proxy.ts                   Route guard (Next.js 16 renamed middleware → proxy)
src/lib/bot/                   Bot composition
  ├─ auth.ts                   Role resolution, permissions, audit logging
  ├─ keyboards.ts              Button labels, menus, categories
  ├─ storage.ts                Wizard state, persisted in Postgres
  └─ flows/                    cash · bank · credit · entries · reports · admin
src/lib/reporting.ts           Balances, net margin, monthly series
src/lib/excel.ts               Monthly .xlsx export
```

### Why wizard state lives in the database

Each webhook call is a cold serverless invocation with no memory of the last
one. `BotSession` stores the current step and the partially collected entry,
keyed by chat ID, so a multi-step dialogue survives between updates. Pressing
any menu button or sending a command clears it, so a user can never get stuck
mid-flow.
