import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getPlayForEditorAction, listPlaysAction } from "@/app/actions/plays";
import { PlayCarousel } from "@/features/viewer/PlayCarousel";

type Props = {
  params: Promise<{ playId: string }>;
  searchParams: Promise<{ playbookId?: string }>;
};

export default async function MobilePlayPage({ params, searchParams }: Props) {
  const { playId } = await params;
  const { playbookId: playbookFromQuery } = await searchParams;

  if (!hasSupabaseEnv()) {
    return (
      <p className="text-sm text-slate-600">Configure Supabase for mobile viewing.</p>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/m/play/${playId}`);

  const res = await getPlayForEditorAction(playId);
  if (!res.ok) {
    return <p className="text-sm text-red-700">Could not load play.</p>;
  }

  const pbId = playbookFromQuery ?? res.play.playbook_id;
  const list = await listPlaysAction(pbId);
  const plays = list.ok ? list.plays : [];

  return (
    <div className="flex min-h-[80vh] flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Play</p>
        <h1 className="text-xl font-semibold text-slate-900">{res.play.name}</h1>
        <p className="text-sm text-slate-500">{res.play.wristband_code}</p>
      </div>
      <PlayCarousel
        plays={plays.map((p) => ({
          id: p.id,
          name: p.name,
          wristband_code: p.wristband_code,
          shorthand: p.shorthand,
        }))}
        currentId={playId}
        document={res.document}
        playbookId={pbId}
      />
    </div>
  );
}
