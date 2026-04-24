"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { setBetaFeatureScopeAction } from "@/app/actions/admin-beta-features";
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
    key: "marketing_content",
    label: "Enhanced marketing content",
    description:
      "Pre-auth landing page addition. When on, shows a \"Learn More Here\" link under the main CTAs. \"Only me\" doesn't apply here — the link is either public or hidden.",
    disabledScopes: ["me"],
    previewHref: "/learn-more",
  },
];

const SCOPE_OPTIONS: { value: BetaFeatureScope; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Hidden from everyone" },
  { value: "me", label: "Only me", hint: "Site admins only" },
  { value: "all", label: "Everyone entitled", hint: "All coaches" },
];

export function BetaFeaturesAdminClient({
  initialFeatures,
}: {
  initialFeatures: BetaFeatures;
}) {
  const { toast } = useToast();
  const [features, setFeatures] = useState<BetaFeatures>(initialFeatures);
  const [pendingKey, setPendingKey] = useState<BetaFeatureKey | null>(null);
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
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Toggle in-development features. &ldquo;Only me&rdquo; lets you test in production
        without exposing it to other users. &ldquo;Everyone entitled&rdquo; turns it on for
        all coaches.
      </p>
      {FEATURES.map((f) => {
        const current = features[f.key];
        const isPending = pendingKey === f.key;
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
          </div>
        );
      })}
    </div>
  );
}
