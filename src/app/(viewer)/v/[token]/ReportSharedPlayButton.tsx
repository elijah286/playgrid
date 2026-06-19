"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { ReportDialog } from "@/components/moderation/ReportDialog";

/** Subtle report control for a publicly-shared play (Guideline 1.2). Works for
 *  anonymous viewers — the report RPC accepts a NULL reporter. */
export function ReportSharedPlayButton({
  token,
  coachName,
}: {
  token: string;
  coachName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
      >
        <Flag className="size-3.5" />
        Report this play
      </button>
      <ReportDialog
        open={open}
        onClose={() => setOpen(false)}
        contentType="shared_play"
        contentRef={token}
        reportedText={coachName ?? null}
        label="Report this play"
      />
    </div>
  );
}
