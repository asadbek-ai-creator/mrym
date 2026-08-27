import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход · Mariyam" };

/**
 * The card around the form is static, so it prerenders. Only the redirect
 * target comes from the URL, and that waits behind its own boundary.
 */
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ink)] text-lg text-[var(--surface)]">
            ₮
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Финансовый учёт
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            Доступ к панели для администратора.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <Suspense fallback={<FormSkeleton />}>
            <Form searchParams={props.searchParams} />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--ink-muted)]">
          Данные вносятся через Telegram-бот. Эта панель — только для просмотра.
        </p>
      </div>
    </main>
  );
}

async function Form({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const params = await searchParams;
  const raw = params.next;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  // Only same-origin paths are followed, so `?next=` cannot bounce a signed-in
  // admin to another site.
  const next =
    requested?.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  return <LoginForm next={next} />;
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
      <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
    </div>
  );
}
