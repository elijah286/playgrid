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
    key: "coach_ai",
    label: "Coach AI",
    description:
      "AI assistant for coaches. When on for everyone, only entitled coaches see it.",
  },
  {
    key: "game_mode",
    label: "Game Mode",
    description:
      "Mobile-first in-game flow for coaches: pick plays fast and log outcomes.",
  },
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
    key: "practice_plans",
    label: "Practice Plans",
    description:
      "Practice Plans tab inside a playbook. Coaches build reusable practice templates with timed blocks, parallel activities (Skill / Line / Specialists), and drill diagrams using equipment props (cones, ladders, hurdles).",
  },
  {
    key: "marketing_content",
    label: "Enhanced marketing content",
    description:
      "Pre-auth landing page addition. When on, shows a \"Learn More Here\" link under the main CTAs. \"Only me\" doesn't apply here — the link is either public or hidden.",
    disabledScopes: ["me"],
    previewHref: "/#tour",
  },
];

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
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                className="inline-flex overflow-hidden rounded-lg ring-1 ring-border"
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
