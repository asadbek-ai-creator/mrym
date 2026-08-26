import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Mariyam" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const raw = params.next;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const next =
    requested?.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ink)] text-lg text-[var(--surface)]">
            ₮
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Financial accounting
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            Administrator access to the dashboard.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--ink-muted)]">
          Data entry happens in the Telegram bot. This dashboard is read-only.
        </p>
      </div>
    </main>
  );
}
