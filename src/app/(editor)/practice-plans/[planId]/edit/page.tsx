import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPracticePlanAction } from "@/app/actions/practice-plans";
import { PracticePlanEditorClient } from "@/features/practice-plans/PracticePlanEditorClient";
import type { SportVariant } from "@/domain/play/types";

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

  const res = await getPracticePlanAction(planId);
  if (!res.ok) notFound();

  const [{ data: membership }, { data: book }] = await Promise.all([
    sb
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", res.plan.playbook_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    sb
      .from("playbooks")
      .select("sport_variant")
      .eq("id", res.plan.playbook_id)
      .maybeSingle(),
  ]);
  const memberRole = membership?.role as string | null;
  const isCoachInPlaybook = memberRole === "owner" || memberRole === "editor";
  if (!isCoachInPlaybook) notFound();

  const variant = (book?.sport_variant as SportVariant | null) ?? null;

  return (
    <PracticePlanEditorClient
      planId={planId}
      playbookId={res.plan.playbook_id}
      initialTitle={res.plan.title}
      initialDocument={res.document}
      variant={variant}
    />
  );
}
