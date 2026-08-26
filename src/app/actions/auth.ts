"use server";

import { redirect } from "next/navigation";
import { checkPassword, endSession, startSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface LoginState {
  error?: string;
}

export async function login(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!password) return { error: "Enter the password." };
  if (!checkPassword(password)) {
    await prisma.actionLog.create({
      data: { action: "DASHBOARD_LOGIN_FAILED" },
    });
    return { error: "Incorrect password." };
  }

  await startSession();
  await prisma.actionLog.create({ data: { action: "DASHBOARD_LOGIN" } });

  // Only allow same-site paths, so `next` cannot be used as an open redirect.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
