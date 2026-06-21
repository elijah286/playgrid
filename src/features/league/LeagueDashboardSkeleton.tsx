import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  ClipboardList,
  Megaphone,
  Palette,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";

const GLANCE: [string, LucideIcon][] = [
  ["Registration", ClipboardList],
  ["Roster gaps", Users],
  ["What's coming up", Calendar],
  ["Action items", AlertTriangle],
];

const WORKFLOWS: [string, LucideIcon][] = [
  ["Registration & payments", ClipboardList],
  ["Roster, teams & coaches", Users],
  ["Communications", Megaphone],
  ["Schedule & events", Calendar],
];

const MORE: [string, LucideIcon][] = [
  ["Playbooks & drills", BookOpen],
  ["Branding", Palette],
  ["Store", ShoppingBag],
  ["Settings", Settings],
];

/** Static preview of the mission-control dashboard — used dimmed behind the
 *  first-league prompt so a new operator sees what they're about to get. */
export function LeagueDashboardSkeleton() {
  return (
    <div className="text-foreground">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="h-3 w-40 rounded bg-foreground/10" />
        <div className="h-7 w-24 rounded-lg bg-foreground/10" />
      </div>
      <div className="py-5">
        <div className="h-7 w-60 rounded bg-foreground/10" />
        <div className="mt-2.5 h-3 w-44 rounded bg-foreground/10" />
      </div>

      <div className="mb-2 text-xs font-medium text-muted">At a glance</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GLANCE.map(([label, Icon]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Icon className="size-4" />
              {label}
            </div>
            <div className="mt-3 h-6 w-16 rounded bg-foreground/10" />
            <div className="mt-2.5 h-3 w-24 rounded bg-foreground/10" />
          </div>
        ))}
      </div>

      <div className="mb-2 mt-8 text-xs font-medium text-muted">Workflows</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WORKFLOWS.map(([label, Icon]) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3.5"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-inset text-muted">
              <Icon className="size-5" />
            </div>
            <div className="text-sm font-semibold">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-2 mt-8 text-xs font-medium text-muted">More</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {MORE.map(([label, Icon]) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-muted"
          >
            <Icon className="size-4" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
