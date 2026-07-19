import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import { getDashboardSummaryAction } from "@/app/actions/plays";
import {
  listPlaybookMessagesAction,
  getPlaybookUnreadCountAction,
} from "@/app/actions/playbook-messages";
import {
  readSelectedTeam,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team-server";

const FALLBACK = "#64748B";

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Cross-team conversation list — the "did anyone message any of my teams?"
 * view the production lobby is missing. One row per team (last message +
 * unread), opening into that team's single channel. Same data as the
 * production per-team chat.
 */
export default async function AppMessagesPage() {
  const selected = await readSelectedTeam();
  const summary = await getDashboardSummaryAction();
  let teams = summary.ok
    ? summary.data.playbooks.filter((p) => !p.is_default && !p.is_archived && !p.is_example)
    : [];
  if (selected !== ALL_TEAMS) teams = teams.filter((t) => t.id === selected);

  const rows = await Promise.all(
    teams.map(async (t) => {
      const [msgRes, unreadRes] = await Promise.all([
        listPlaybookMessagesAction(t.id, { limit: 1 }),
        getPlaybookUnreadCountAction(t.id),
      ]);
      const last = msgRes.ok ? (msgRes.messages[0] ?? null) : null;
      return {
        id: t.id,
        name: t.name,
        color: t.color,
        logoUrl: t.logo_url,
        lastBody: last ? (last.deletedAt ? "Message deleted" : last.body) : null,
        lastAuthor: last?.author?.displayName ?? null,
        lastAt: last?.createdAt ?? null,
        unread: unreadRes.ok ? unreadRes.unread : 0,
      };
    }),
  );
  rows.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-foreground">Messages</h1>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          You&rsquo;re not on any teams with messaging yet.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/app/messages/${r.id}`}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-inset"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-black text-white"
                  style={{ backgroundColor: r.color || FALLBACK }}
                >
                  {r.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-foreground">{r.name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{relTime(r.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted">
                      {r.lastBody
                        ? `${r.lastAuthor ? `${r.lastAuthor}: ` : ""}${r.lastBody}`
                        : "No messages yet"}
                    </span>
                    {r.unread > 0 ? (
                      <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                        {r.unread > 99 ? "99+" : r.unread}
                      </span>
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
        <MessageCircle className="size-3.5" aria-hidden />
        Each team has one group channel — coaches, players &amp; parents.
      </p>
    </div>
  );
}
