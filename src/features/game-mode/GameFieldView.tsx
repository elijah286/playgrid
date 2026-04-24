"use client";

import { useMemo } from "react";
import type { PlayDocument } from "@/domain/play/types";
import type { PlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { EditorCanvas } from "@/features/editor/EditorCanvas";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";

const VIEWPORT_LENGTH_YDS = 25;
const noop = () => {};

/**
 * Read-only field renderer for game mode. Reuses the editor's
 * EditorCanvas + AnimationOverlay so coaches see the play exactly as they
 * did before entering game mode. Playback controls live in a separate
 * inline toolbar rendered by the parent, so the anim is passed in.
 *
 * The wrapper carries the editor's `.field-viewport` class so it inherits
 * the mobile size cap; pointer-events-none disables editing.
 */
export function GameFieldView({
  document,
  fallbackPreview,
  anim,
}: {
  document: PlayDocument | null;
  fallbackPreview: PlayThumbnailInput | null;
  anim: PlayAnimation | null;
}) {
  if (!document || !anim) {
    return (
      <div className="mx-auto w-full max-w-[420px]">
        {fallbackPreview && <PlayThumbnail preview={fallbackPreview} />}
      </div>
    );
  }
  return <GameFieldPlayback document={document} anim={anim} />;
}

function GameFieldPlayback({
  document,
  anim,
}: {
  document: PlayDocument;
  anim: PlayAnimation;
}) {
  const fieldAspect =
    document.sportProfile.fieldWidthYds / (VIEWPORT_LENGTH_YDS * 0.75);

  const animatingPlayerIds = useMemo(() => {
    if (anim.phase === "idle") return null;
    return new Set(anim.flats.map((f) => f.carrierPlayerId));
  }, [anim.phase, anim.flats]);

  return (
    <div
      className="field-viewport relative mx-auto w-full cursor-pointer select-none overflow-hidden"
      onClick={anim.step}
      style={
        {
          aspectRatio: `${fieldAspect} / 1`,
          ["--field-aspect" as string]: String(fieldAspect),
        } as React.CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0">
        <EditorCanvas
          doc={document}
          dispatch={noop}
          selectedPlayerId={null}
          selectedRouteId={null}
          selectedNodeId={null}
          selectedSegmentId={null}
          selectedZoneId={null}
          onSelectPlayer={noop}
          onSelectRoute={noop}
          onSelectNode={noop}
          onSelectSegment={noop}
          onSelectZone={noop}
          activeShape="straight"
          activeStrokePattern="solid"
          activeColor="#1C1C1E"
          activeWidth={2}
          fieldAspect={fieldAspect}
          fieldBackground={document.fieldBackground}
          animatingPlayerIds={animatingPlayerIds}
        />
      </div>
      <AnimationOverlay doc={document} anim={anim} fieldAspect={fieldAspect} />
    </div>
  );
}
