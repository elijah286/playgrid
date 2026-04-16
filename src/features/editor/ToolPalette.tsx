"use client";

import { MousePointer, Pencil, Waypoints, Check } from "lucide-react";
import { SegmentedControl, Button } from "@/components/ui";
import type { Tool } from "./EditorCanvas";

type Props = {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  onFinishPolyline?: () => void;
  polylineActive: boolean;
};

const toolOptions: { value: Tool; label: string; icon: typeof MousePointer }[] = [
  { value: "select", label: "Select", icon: MousePointer },
  { value: "sketch", label: "Sketch", icon: Pencil },
  { value: "polyline", label: "Points", icon: Waypoints },
];

export function ToolPalette({ tool, onToolChange, onFinishPolyline, polylineActive }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl options={toolOptions} value={tool} onChange={onToolChange} />
      {polylineActive && tool === "polyline" && (
        <Button variant="primary" size="sm" leftIcon={Check} onClick={onFinishPolyline}>
          Finish route
        </Button>
      )}
    </div>
  );
}
