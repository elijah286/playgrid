"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SportVariant } from "@/domain/play/types";
import { useTutorial } from "./engine/TutorialProvider";
import { TUTORIALS } from "./tutorials";
import type { TutorialId } from "./engine/types";

function isSupportedVariant(v: string | null | undefined): v is SportVariant {
  return (
    v === "flag_5v5" ||
    v === "flag_6v6" ||
    v === "flag_7v7" ||
    v === "tackle_11"
  );
}

/**
 * Generic `?tour=<id>` deep-link handler. Mount this in every surface
 * that hosts a tutorial — play editor, practice-plan editor, game-mode,
 * print preview, etc. On mount it reads the query param, looks up the
 * matching def from TUTORIALS, force-starts the tour, and strips the
 * param so a refresh doesn't re-trigger.
 *
 * Variant filtering ensures a tour built for one sport (e.g. tackle_11)
 * doesn't start on a playbook scoped to another variant.
 *
 * The component has no UI — it's a pure side-effect on mount.
 */
export function TutorialDeepLinkLauncher({
  variant,
}: {
  variant: SportVariant | null;
}) {
  const { start, active } = useTutorial();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tourParam = searchParams.get("tour") as TutorialId | null;
    if (!tourParam) return;
    const def = TUTORIALS[tourParam];
    if (!def) return;
    if (!variant || !isSupportedVariant(variant)) return;
    if (!def.supportedVariants.includes(variant)) return;
    if (active) return;
    start(def, variant);
    // Drop the query param. Router-level replace keeps history clean.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tour");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    router.replace(path, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, variant]);

  return null;
}
