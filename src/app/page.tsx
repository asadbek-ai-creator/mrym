import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";

// The whole page is a session-dependent redirect, so there is no shell worth
// prerendering. `instant = false` lets the route block on that decision
// instead of demanding a Suspense boundary around it.
export const instant = false;

export default async function Home() {
  redirect((await hasSession()) ? "/dashboard" : "/login");
}
