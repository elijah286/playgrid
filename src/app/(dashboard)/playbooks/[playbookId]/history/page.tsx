import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { HistoryView } from "@/features/versions/HistoryView";

type Props = { params: Promise<{ playbookId: string }> };

export const metadata = { robots: { index: false, follow: false } };

export default async function PlaybookHistoryPage({ params }: Props) {
  const { playbookId } = await params;

  if (!hasSupabaseEnv()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=/playbooks/${playbookId}/history`);

  const { data: book } = await supabase
    .from("playbooks")
    .select("id, name")
    .eq("id", playbookId)
    .maybeSingle();
  if (!book) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const features = await getBetaFeatures();
  const available = isBetaFeatureAvailable(features.version_history, {
    isAdmin,
    isEntitled: true,
  });
  if (!available) redirect(`/playbooks/${playbookId}`);

  return <HistoryView playbookId={playbookId} playbookName={book.name as string} />;
}
