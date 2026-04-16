import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getPlayForEditorAction, listPlaysAction } from "@/app/actions/plays";
import { PlayCarousel } from "@/features/viewer/PlayCarousel";
import { Badge } from "@/components/ui";

type Props = {
  params: Promise<{ playId: string }>;
  searchParams: Promise<{ playbookId?: string }>;
};

export default async function MobilePlayPage({ params, searchParams }: Props) {
  const { playId } = await params;
  const { playbookId: playbookFromQuery } = await searchParams;

  if (!hasSupabaseEnv()) {
    return (
      <p className="text-sm text-muted">Configure Supabase for mobile viewing.</p>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/m/play/${playId}`);

  const res = await getPlayForEditorAction(playId);
  if (!res.ok) {
    return <p className="text-sm text-danger">Could not load play.</p>;
  }

  const pbId = playbookFromQuery ?? res.play.playbook_id;
  const list = await listPlaysAction(pbId);
  const plays = list.ok ? list.plays : [];

  return (
    <div className="flex min-h-[80vh] flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Play</p>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{res.play.name}</h1>
        {res.play.wristband_code && (
          <Badge variant="primary" className="mt-1">{res.play.wristband_code}</Badge>
        )}
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
