"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import {
  setBetaFeatureScopeAction,
  getBetaFeatureAllowlistAction,
  addEmailToAllowlistAction,
  removeEmailFromAllowlistAction,
} from "@/app/actions/admin-beta-features";
import type {
  BetaFeatureKey,
  BetaFeatureScope,
  BetaFeatures,
} from "@/lib/site/beta-features-config";

type FeatureMeta = {
  key: BetaFeatureKey;
  label: string;
  description: string;
  disabledScopes?: BetaFeatureScope[];
  previewHref?: string;
};

const FEATURES: FeatureMeta[] = [
  {
    key: "game_results",
    label: "Game Results",
    description:
      "Playbook tab showing per-game and aggregate play outcomes from Game Mode.",
  },
  {
    key: "team_calendar",
    label: "Team Calendar",
    description:
      "Per-playbook calendar for practices, games, and scrimmages with RSVPs, ICS feed, email notifications, and a cross-playbook landing page view.",
  },
  {
    key: "play_comments",
    label: "Play Comments",
    description:
      "Per-play discussion threads with likes and replies. Visible only to playbook members. Coach controls a per-playbook on/off toggle. Privacy policy must reflect this before scope is widened beyond \"Only me\".",
  },
  {
    key: "version_history",
    label: "Version History",
    description:
      "Team coaches can view edit history for plays and playbooks, restore prior versions, and recover deleted plays from a 30-day trash. Snapshots are written for everyone regardless of this flag.",
  },
  {
    key: "team_messaging",
    label: "Team Messaging",
    description:
      "Per-playbook team chat where coaches, players, and parents trade messages about practices, equipment, and schedule. Realtime delivery with typing indicators, markdown formatting, and 15-minute self-edit window. The owner can disable messaging or clear all history per playbook.",
  },
  {
    key: "marketing_content",
    label: "Enhanced marketing content",
    description:
      "Pre-auth landing page addition. When on, shows a \"Learn More Here\" link under the main CTAs. \"Only me\" doesn't apply here — the link is either public or hidden.",
    disabledScopes: ["me"],
    previewHref: "/tour",
  },
  {
    key: "coach_ai_image_upload",
    label: "Coach Cal — photo / file attach (retired)",
    description:
      "The old June chat pipeline: a paperclip in Coach Cal chat that read play-sheet photos into diagrams directly. It was hard-disabled in code (COACH_CAL_IMAGE_UPLOADS_ENABLED) after misreading ~30% of hand-drawn routes, so THIS TOGGLE IS CURRENTLY INERT — flipping it does nothing. Superseded by \"Photo play import\" below, which is the rebuilt, review-first version.",
  },
  {
    key: "photo_play_import",
    label: "Photo play import",
    description:
      "Import plays from a photo — the rebuilt version of photo→play. Lives on the PLAYBOOK page (camera \"Import\" button next to \"New play\"), not in Cal chat. Photograph a printed sheet or a clear hand-drawn play: panels are detected, each play is read semantically against the route catalog (families, depths, break directions — never raw geometry), and the coach reviews the draft beside the photo with per-route confidence badges before anything saves. Metered by the monthly Cal image cap. Keep at \"Only me\" until the extraction eval bar is met (scripts/photo-import-eval).",
  },
  {
    key: "football_library",
    label: "Football library",
    description:
      "Public coaching library at /learn/library — concept pages for every play, formation, route, and defensive scheme in the catalog. Each play page renders in the canonical editor. When hidden, the Resources → Football library link, the home page library teaser, and every library URL all disappear or 404 for non-entitled users. Admins always see it (so the editorial pass can be reviewed in production).",
    previewHref: "/learn/library",
  },
  {
    key: "offline_auto_cache",
    label: "Offline — auto-cache all playbooks",
    description:
      "Native app only. When on, every one of a coach's playbooks auto-downloads into the on-device cache and stays fresh in the background (vs the manual per-playbook \"Download for offline\"), so the whole library works on the sideline with no signal. Reads work offline; editing still needs a connection. Start with \"Only me\" to verify on a device before widening.",
    disabledScopes: ["custom"],
  },
]

const SCOPE_OPTIONS: { value: BetaFeatureScope; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Hidden from everyone" },
  { value: "me", label: "Only me", hint: "Site admins only" },
  { value: "all", label: "Everyone entitled", hint: "All coaches" },
  { value: "custom", label: "Custom emails", hint: "Specific users only" },
];

export function BetaFeaturesAdminClient({
  initialFeatures,
}: {
  initialFeatures: BetaFeatures;
}) {
  const { toast } = useToast();
  const [features, setFeatures] = useState<BetaFeatures>(initialFeatures);
  const [pendingKey, setPendingKey] = useState<BetaFeatureKey | null>(null);
  const [allowlists, setAllowlists] = useState<Record<BetaFeatureKey, string[]>>({} as Record<BetaFeatureKey, string[]>);
  const [expandedFeature, setExpandedFeature] = useState<BetaFeatureKey | null>(null);
  const [newEmail, setNewEmail] = useState<Record<BetaFeatureKey, string>>({} as Record<BetaFeatureKey, string>);
  const [, startTransition] = useTransition();

  function changeScope(key: BetaFeatureKey, scope: BetaFeatureScope) {
    if (features[key] === scope) return;
    const prev = features;
    setFeatures({ ...prev, [key]: scope });
    setPendingKey(key);
    startTransition(async () => {
      const res = await setBetaFeatureScopeAction(key, scope);
      setPendingKey(null);
      if (!res.ok) {
        setFeatures(prev);
        toast(res.error, "error");
        return;
      }
      setFeatures(res.features);
      toast("Beta feature updated.", "success");
      // Load allowlist when switching to custom scope
      if (scope === "custom") {
        loadAllowlist(key);
      }
    });
  }

  async function loadAllowlist(key: BetaFeatureKey) {
    const res = await getBetaFeatureAllowlistAction(key);
    if (res.ok) {
      setAllowlists({ ...allowlists, [key]: res.emails });
      setExpandedFeature(key);
    } else {
      toast(res.error, "error");
    }
  }

  async function addEmail(key: BetaFeatureKey) {
    const email = newEmail[key]?.trim() || "";
    if (!email) return;

    startTransition(async () => {
      const res = await addEmailToAllowlistAction(key, email);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setAllowlists({ ...allowlists, [key]: res.emails });
      setNewEmail({ ...newEmail, [key]: "" });
      toast("Email added to allowlist.", "success");
    });
  }

  async function removeEmail(key: BetaFeatureKey, email: string) {
    startTransition(async () => {
      const res = await removeEmailFromAllowlistAction(key, email);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setAllowlists({ ...allowlists, [key]: res.emails });
      toast("Email removed from allowlist.", "success");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Toggle in-development features. &ldquo;Only me&rdquo; lets you test in production
        without exposing it to other users. &ldquo;Everyone entitled&rdquo; turns it on for
        all coaches. &ldquo;Custom emails&rdquo; enables it for specific users only.
      </p>
      {FEATURES.map((f) => {
        const current = features[f.key];
        const isPending = pendingKey === f.key;
        const isExpanded = expandedFeature === f.key;
        const emails = allowlists[f.key] ?? [];
        return (
          <div
            key={f.key}
            className="rounded-2xl border border-border bg-surface-raised p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{f.label}</p>
                <p className="mt-0.5 text-xs text-muted">{f.description}</p>
                {f.previewHref && (
                  <a
                    href={f.previewHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Preview page →
                  </a>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label={`${f.label} scope`}
                className="inline-flex self-start overflow-hidden rounded-lg ring-1 ring-border sm:self-auto"
              >
                {SCOPE_OPTIONS.map((opt) => {
                  const active = current === opt.value;
                  const scopeDisabled = f.disabledScopes?.includes(opt.value) ?? false;
                  const disabled = isPending || scopeDisabled;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={scopeDisabled ? "Not applicable for this feature" : opt.hint}
                      disabled={disabled}
                      onClick={() => changeScope(f.key, opt.value)}
                      className={
                        "px-3 py-1.5 text-xs font-medium transition-colors " +
                        (active
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface text-foreground hover:bg-surface-hover") +
                        (scopeDisabled ? " cursor-not-allowed opacity-40" : "")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {current === "custom" && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="email@example.com"
                      value={newEmail[f.key] || ""}
                      onChange={(e) =>
                        setNewEmail({ ...newEmail, [f.key]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addEmail(f.key);
                      }}
                      disabled={isPending}
                      className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-xs placeholder-muted disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => addEmail(f.key)}
                      disabled={isPending || !newEmail[f.key]?.trim()}
                      className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {emails.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted">
                        Allowed emails ({emails.length}):
                      </p>
                      <div className="space-y-1">
                        {emails.map((email) => (
                          <div
                            key={email}
                            className="flex items-center justify-between gap-2 rounded bg-surface px-2 py-1.5"
                          >
                            <span className="text-xs text-foreground">{email}</span>
                            <button
                              type="button"
                              onClick={() => removeEmail(f.key, email)}
                              disabled={isPending}
                              className="text-xs text-destructive hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
