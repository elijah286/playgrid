"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE, getAccessibleOrgs } from "@/lib/league/console";
import { getRequestUser } from "@/lib/supabase/request-user";

/**
 * Switch the active organization context. Validates that the caller actually has
 * access to the requested org (own or delegated) before persisting it, so a
 * forged cookie can't widen access — and the read paths re-validate regardless.
 * Lands the operator on the portfolio dashboard, now scoped to the new org.
 */
export async function setActiveOrgAction(ownerId: string): Promise<void> {
  const auth = await getRequestUser();
  if (auth.kind !== "ok" || !auth.user) redirect("/login");
  const user = auth.user;

  const orgs = await getAccessibleOrgs(user.id, user.email ?? null);
  if (!orgs.some((o) => o.ownerId === ownerId)) redirect("/league");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, ownerId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/league");
}
