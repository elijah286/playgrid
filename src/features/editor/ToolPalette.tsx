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
          ? "bg-slate-900 text-white shadow-sm"
          : "bg-white/80 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
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
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
        >
          Finish route
        </button>
      )}
    </div>
  );
}
