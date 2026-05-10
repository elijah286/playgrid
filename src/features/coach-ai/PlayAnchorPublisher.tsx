"use client";

import { useEffect } from "react";
import { setPlayAnchor, clearPlayAnchor } from "./play-anchor";

export function PlayAnchorPublisher({
  playId,
  playName,
}: {
  playId: string;
  playName: string | null;
}) {
  useEffect(() => {
    setPlayAnchor({ id: playId, name: playName });
    return () => {
      clearPlayAnchor(playId);
    };
  }, [playId, playName]);
  return null;
}
