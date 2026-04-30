import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBetaFeatures, isBetaFeatureAvailable } from "@/lib/site/beta-features-config";
import { getPracticePlanAction } from "@/app/actions/practice-plans";
import { PracticePlanPrintView } from "@/features/practice-plans/PracticePlanPrintView";

export const dynamic = "force-dynamic";

export default async function PracticePlanPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { planId } = await params;
  const { auto } = await searchParams;
  const sb = await createClient();
  const { data: userRes } = await sb.auth.getUser();
  const user = userRes.user;
  if (!user) redirect("/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  const beta = await getBetaFeatures();
  const allowed = isBetaFeatureAvailable(beta.practice_plans, {
    isAdmin,
    isEntitled: false,
  });
  if (!allowed) notFound();

  const res = await getPracticePlanAction(planId);
  if (!res.ok) notFound();

  return (
    <PracticePlanPrintView
      title={res.plan.title}
      document={res.document}
      autoPrint={auto === "1"}
    />
  );
}
