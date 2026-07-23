"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { LogoPicker } from "@/components/ui/LogoPicker";
import { PlaybookRulesForm } from "@/features/playbooks/PlaybookRulesForm";
import {
  normalizePlaybookSettings,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import type { SportVariant } from "@/domain/play/types";
import {
  renamePlaybookAction,
  updatePlaybookSeasonAction,
  updatePlaybookAppearanceAction,
  updatePlaybookSettingsAction,
  updateRosterApprovalRequiredAction,
} from "@/app/actions/playbooks";
import { setPlaybookPlaysSharedAction } from "@/app/actions/plays";

const PALETTE = [
  "#F26522", "#1769FF", "#7C3AED", "#0891B2",
  "#16A34A", "#DC2626", "#134e2a", "#0F172A",
];

type Team = {
  id: string;
  name: string;
  season: string | null;
  color: string | null;
  logoUrl: string | null;
  sportVariant: SportVariant;
};
type Res = { ok: true } | { ok: false; error: string };

export function SettingsClient({
  team,
  approvalRequired,
  playsShared,
  settings,
  canManage,
}: {
  team: Team;
  approvalRequired: boolean;
  playsShared: boolean;
  settings: PlaybookSettings | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(team.name);
  const [season, setSeason] = useState(team.season ?? "");
  const [color, setColor] = useState(team.color ?? "#134e2a");
  const [approval, setApproval] = useState(approvalRequired);
  const [sharePlays, setSharePlays] = useState(playsShared);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? "");
  const [rules, setRules] = useState<PlaybookSettings | null>(settings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const logoDirty = logoUrl !== (team.logoUrl ?? "");
  // Compare a NORMALIZED projection of the edited rules against the (already
  // normalized) server settings — otherwise cosmetic server normalization
  // (null rushingYards→0, capability re-ordering) leaves Save stuck "dirty"
  // after a successful save. Projecting (rather than resetting `rules` on every
  // settings change) avoids clobbering in-progress edits when another card's
  // save triggers router.refresh().
  const rulesDirty =
    !!rules &&
    !!settings &&
    JSON.stringify(normalizePlaybookSettings(rules, team.sportVariant)) !==
      JSON.stringify(settings);

  const run = (key: string, fn: () => Promise<Res>, optimistic?: () => void) => {
    setError(null);
    setSaved(null);
    optimistic?.();
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error);
        else {
          setSaved(key);
          router.refresh();
        }
      } catch {
        // A rejected server action THROWS — surface it, never a silent no-op.
        setError("Couldn't save — check your connection and try again.");
      }
    });
  };

  if (!canManage) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        Only the team owner can change these settings.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {/* Name */}
      <Card label="Team name" savedNow={saved === "name"}>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <SaveBtn
            disabled={pending || !name.trim() || name === team.name}
            onClick={() => run("name", () => renamePlaybookAction(team.id, name.trim()))}
            pending={pending}
          />
        </div>
      </Card>

      {/* Season */}
      <Card label="Season" savedNow={saved === "season"}>
        <div className="flex gap-2">
          <input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="e.g. Fall 2026"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <SaveBtn
            disabled={pending || season === (team.season ?? "")}
            onClick={() => run("season", () => updatePlaybookSeasonAction(team.id, season.trim() || null))}
            pending={pending}
          />
        </div>
      </Card>

      {/* Color */}
      <Card label="Team color" savedNow={saved === "color"}>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use ${c}`}
              disabled={pending}
              onClick={() =>
                run(
                  "color",
                  // Preserve the freshest client logo (not the render-time prop,
                  // which is stale during a logo save's refresh window).
                  () =>
                    updatePlaybookAppearanceAction(team.id, {
                      logo_url: logoUrl.trim() || null,
                      color: c,
                    }),
                  () => setColor(c),
                )
              }
              className="grid size-8 place-items-center rounded-lg ring-2 ring-offset-2 ring-offset-surface-raised transition-transform hover:scale-105 disabled:opacity-50"
              style={{ backgroundColor: c, boxShadow: color === c ? undefined : "none" }}
            >
              {color === c && <Check className="size-4 text-white" aria-hidden />}
            </button>
          ))}
        </div>
      </Card>

      {/* Logo */}
      <Card label="Team logo" savedNow={saved === "logo"}>
        <div className="space-y-2.5">
          <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={pending} />
          <div className="flex justify-end">
            <SaveBtn
              disabled={pending || !logoDirty}
              onClick={() =>
                run("logo", () =>
                  updatePlaybookAppearanceAction(team.id, {
                    logo_url: logoUrl.trim() || null,
                    // Preserve the raw server color (may be null) so a logo-only
                    // save never persists the display-fallback color.
                    color: team.color,
                  }),
                )
              }
              pending={pending}
            />
          </div>
        </div>
      </Card>

      {/* Game rules */}
      {rules && (
        <Card label="Game rules" savedNow={saved === "rules"}>
          <div className="space-y-3">
            <PlaybookRulesForm
              value={rules}
              onChange={setRules}
              sportVariant={team.sportVariant}
              disabled={pending}
            />
            <div className="flex justify-end">
              <SaveBtn
                disabled={pending || !rulesDirty}
                onClick={() =>
                  run("rules", () => updatePlaybookSettingsAction(team.id, rules))
                }
                pending={pending}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Roster approval */}
      <Card label="Approve new players" savedNow={saved === "approval"}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Require your approval before someone joins the roster.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={approval}
            disabled={pending}
            onClick={() => {
              const next = !approval;
              run(
                "approval",
                () => updateRosterApprovalRequiredAction(team.id, next),
                () => setApproval(next),
              );
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              approval ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                approval ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </Card>

      {/* Share plays with players (Workstream 2 — master switch) */}
      <Card label="Share plays with players" savedNow={saved === "playsShared"}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            When off, players and parents see no plays — the app stays useful for
            schedule and messages without exposing the playbook. You can still
            share individual plays.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={sharePlays}
            aria-label="Share plays with players"
            disabled={pending}
            onClick={() => {
              const next = !sharePlays;
              run(
                "playsShared",
                () => setPlaybookPlaysSharedAction(team.id, next),
                () => setSharePlays(next),
              );
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              sharePlays ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                sharePlays ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
      )}

      {/* Danger zone (archive / delete / leave) stays a handoff — destructive
          and its success handlers redirect out of the team context. */}
      <Link
        href={`/playbooks/${team.id}`}
        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-inset"
      >
        <span>Archive or delete this team</span>
        <ExternalLink className="size-4 text-muted" aria-hidden />
      </Link>
    </div>
  );
}

function Card({
  label,
  savedNow,
  children,
}: {
  label: string;
  savedNow: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-raised p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</h2>
        {savedNow && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
            <Check className="size-3" aria-hidden /> Saved
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function SaveBtn({
  disabled,
  onClick,
  pending,
}: {
  disabled: boolean;
  onClick: () => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      Save
    </button>
  );
}
