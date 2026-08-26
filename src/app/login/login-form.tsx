"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--ink-secondary)]">
          Пароль администратора
        </span>
        <input
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[15px]
                     outline-none transition
                     focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/25"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-[var(--critical)]/10 px-3 py-2 text-sm text-[var(--critical)]"
        >
          <span aria-hidden>⚠</span>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-[var(--ink)] px-3 py-2.5 text-[15px] font-medium text-[var(--surface)]
                   transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
