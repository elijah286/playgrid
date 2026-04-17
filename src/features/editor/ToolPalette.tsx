"use client";

import { cn } from "@/lib/utils";
import type { Tool } from "./EditorCanvas";

type Props = {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  onFinishPolyline?: () => void;
  polylineActive: boolean;
};

export function ToolPalette({ tool, onToolChange, onFinishPolyline, polylineActive }: Props) {
  const btn = (t: Tool, label: string) => (
    <button
      type="button"
      key={t}
      onClick={() => onToolChange(t)}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition",
        tool === t
          ? "bg-pg-turf text-white shadow-sm"
          : "bg-white/80 text-pg-body ring-1 ring-pg-line hover:bg-pg-mist",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {btn("select", "Select")}
      {btn("sketch", "Sketch")}
      {btn("polyline", "Points")}
      {polylineActive && tool === "polyline" && (
        <button
          type="button"
          onClick={onFinishPolyline}
          className="rounded-lg bg-pg-signal px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-pg-signal-soft0"
        >
          Finish route
        </button>
      )}
    </div>
  );
}
