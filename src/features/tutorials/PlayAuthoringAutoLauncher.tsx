"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import type { SportVariant } from "@/domain/play/types";
import { getTutorialProgressAction } from "@/app/actions/tutorials";
import { useToast } from "@/components/ui";
import { useTutorial } from "./engine/TutorialProvider";
import { PLAY_AUTHORING_TUTORIAL } from "./tutorials/playAuthoring";
import { launchPlayAuthoringTour } from "./launch";

const VISIT_KEY = "xo:editor-visits";
const TOAST_SUPPRESS_KEY = "xo:play-authoring-toast-suppressed";

function readVisitCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(VISIT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function bumpVisitCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const next = readVisitCount() + 1;
    window.localStorage.setItem(VISIT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

function isSupportedVariant(v: string | null | undefined): v is SportVariant {
  return (
    v === "flag_5v5" ||
    v === "flag_6v6" ||
    v === "flag_7v7" ||
    v === "tackle_11"
  );
}

/**
 * Auto-launch policy for the Play Authoring tutorial.
 *
 * First editor visit is already a simplified onboarding surface — we don't
 * want to layer a tour on top. From visit #2 onward, surface a non-blocking
 * toast offering the tour. The toast is dismissable (sticky via
 * localStorage). Server-side progress is the source of truth for
 * "completed" / "dismissed" — those statuses never re-prompt.
 */
export function PlayAuthoringAutoLauncher({
  variant,
  playbookId,
}: {
  variant: SportVariant | null;
  playbookId: string;
}) {
  const { start, active } = useTutorial();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [showToast, setShowToast] = useState(false);
  const [launching, setLaunching] = useState(false);
  const checkedRef = useRef(false);

  // Deep-link from Learning Center: `?tour=play_authoring_v1` force-starts
  // the tour on mount, regardless of visit count or prior dismissal. We
  // strip the query param after triggering so a refresh doesn't re-start.
  useEffect(() => {
    const tourParam = searchParams.get("tour");
    if (tourParam !== "play_authoring_v1") return;
    if (!variant || !isSupportedVariant(variant)) return;
    if (active) return;
    start(PLAY_AUTHORING_TUTORIAL, variant);
    // Drop the query param. Router-level replace keeps history clean.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tour");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    router.replace(path, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, variant]);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    if (!variant || !isSupportedVariant(variant)) return;
    // Skip the visit-count toast path when arriving from a deep-link —
    // the effect above already started the tour.
    if (searchParams.get("tour") === "play_authoring_v1") return;

    const visits = bumpVisitCount();
    if (visits < 2) return;

    try {
      if (window.localStorage.getItem(TOAST_SUPPRESS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    void getTutorialProgressAction("play_authoring_v1").then((res) => {
      if (!res.ok || active) return;
      const status = res.progress?.status ?? "not_started";
      if (status === "completed" || status === "dismissed") return;
      setShowToast(true);
    });
  }, [variant, active, searchParams]);

  const suppressToast = () => {
    setShowToast(false);
    try {
      window.localStorage.setItem(TOAST_SUPPRESS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!showToast || active || !variant || !isSupportedVariant(variant)) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 w-[300px] rounded-xl border border-border bg-surface-raised p-3 shadow-elevated ring-1 ring-black/5"
    >
      <button
        type="button"
        onClick={suppressToast}
        className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-start gap-2.5 pr-4">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Take a 2-minute tour?
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Hands-on tour of creating and editing plays — routes, styling, motion, defense, notes.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={launching}
              onClick={() => {
                setLaunching(true);
                void launchPlayAuthoringTour(playbookId, router).then((res) => {
                  if (!res.ok) {
                    setLaunching(false);
                    toast(
                      res.error ?? "Could not start the tutorial.",
                      "error",
                    );
                  }
                  // On success the editor remounts on the new play and
                  // this component unmounts — leave `launching` set so the
                  // button stays disabled until that happens.
                });
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-progress disabled:opacity-70"
            >
              {launching && <Loader2 className="size-3 animate-spin" />}
              Start tour
            </button>
            <button
              type="button"
              onClick={suppressToast}
              disabled={launching}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-70"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
