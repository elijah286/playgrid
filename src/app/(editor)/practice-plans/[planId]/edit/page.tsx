import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBetaFeatures, isBetaFeatureAvailable } from "@/lib/site/beta-features-config";
import { getPracticePlanAction } from "@/app/actions/practice-plans";
import { PracticePlanEditorClient } from "@/features/practice-plans/PracticePlanEditorClient";

export const dynamic = "force-dynamic";

export default async function PracticePlanEditPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
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
    isEntitled: false, // gate strictly via beta scope
  });
  if (!allowed) notFound();

  const res = await getPracticePlanAction(planId);
  if (!res.ok) notFound();

  return (
    <PracticePlanEditorClient
      planId={planId}
      playbookId={res.plan.playbook_id}
      initialTitle={res.plan.title}
      initialDocument={res.document}
    />
  );
}
