"use client";

import { useState } from "react";
import { Users, UserPlus, ClipboardCheck, MessageSquare } from "lucide-react";
import { TeamCoachUpgradeDialog } from "./TeamCoachUpgradeDialog";

/**
 * Free-coach paywall for the Roster tab. Mirrors the inline panel + dialog
 * pattern used by the Calendar and Practice Plans tabs.
 */
export function RosterUpgradePanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-2xl border border-dashed border-border bg-surface-raised p-8 text-center">
        <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-brand-green text-white">
          <Users className="size-5" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Roster is a Team Coach feature
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Add your players, invite them to the playbook, and keep everyone on
          the same page from one shared roster.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          See Team Coach plan
        </button>
      </div>
      <TeamCoachUpgradeDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Roster is a Team Coach feature"
        intro="Bring your team into the playbook. Manage players in one place, share notes, and let them claim their own spot on the field."
        upgradeQuery="roster"
        Icon={Users}
        bullets={[
          {
            Icon: UserPlus,
            text: "Add players individually or in bulk, with positions, jersey numbers, and contact info.",
          },
          {
            Icon: ClipboardCheck,
            text: "Players claim their roster slot to view the playbook on their own device — no app install needed.",
          },
          {
            Icon: MessageSquare,
            text: "Share coach notes per play and per game so the whole team walks in prepared.",
          },
        ]}
      />
    </>
  );
}
