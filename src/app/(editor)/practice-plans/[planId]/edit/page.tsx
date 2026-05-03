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

  // Fetch plan first so we can check playbook membership for the beta gate,
  // matching the same isEntitled logic as the playbook page's tab visibility.
  const res = await getPracticePlanAction(planId);
  if (!res.ok) notFound();

  const { data: membership } = await sb
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", res.plan.playbook_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const memberRole = membership?.role as string | null;
  const isCoachInPlaybook = memberRole === "owner" || memberRole === "editor";

  const beta = await getBetaFeatures();
  const allowed = isBetaFeatureAvailable(beta.practice_plans, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) notFound();

  return (
    <PracticePlanEditorClient
      planId={planId}
      playbookId={res.plan.playbook_id}
      initialTitle={res.plan.title}
      initialDocument={res.document}
    />
  );
}
