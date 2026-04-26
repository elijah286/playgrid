import { ClipboardList, Sparkles, Swords, Trophy, type LucideIcon } from "lucide-react";

export type CalendarEventType = "practice" | "game" | "scrimmage" | "other";

export const EVENT_TYPE_META: Record<
  CalendarEventType,
  {
    label: string;
    icon: LucideIcon;
    /** Tailwind classes for an active (selected/badge) chip. */
    chipActive: string;
    /** Tailwind classes for an inactive chip. */
    chipInactive: string;
    /** Solid colored dot for compact list/calendar rendering. */
    dotClass: string;
  }
> = {
  practice: {
    label: "Practice",
    icon: ClipboardList,
    chipActive:
      "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-800",
    chipInactive:
      "bg-surface text-muted ring-border hover:bg-surface-inset",
    dotClass: "bg-sky-500",
  },
  game: {
    label: "Game",
    icon: Trophy,
    chipActive:
      "bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
    chipInactive:
      "bg-surface text-muted ring-border hover:bg-surface-inset",
    dotClass: "bg-red-500",
  },
  scrimmage: {
    label: "Scrimmage",
    icon: Swords,
    chipActive:
      "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
    chipInactive:
      "bg-surface text-muted ring-border hover:bg-surface-inset",
    dotClass: "bg-amber-500",
  },
  other: {
    label: "Other",
    icon: Sparkles,
    chipActive:
      "bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-800",
    chipInactive:
      "bg-surface text-muted ring-border hover:bg-surface-inset",
    dotClass: "bg-violet-500",
  },
};
