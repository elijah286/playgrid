/**
 * Time + grouping helpers for the messages stream. Pure functions, no I/O —
 * easy to unit-test, no React deps.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * "2m ago", "yesterday at 4:12 PM", "May 1 at 4:12 PM" — same vocabulary
 * iMessage/Slack use. Anything under 45 seconds reads as "just now".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();

  if (diff < 45_000) return "just now";
  if (diff < HOUR) {
    const m = Math.max(1, Math.round(diff / MIN));
    return `${m}m ago`;
  }
  if (diff < DAY && now.getDate() === then.getDate()) {
    const h = Math.round(diff / HOUR);
    return `${h}h ago`;
  }

  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) {
    const h = Math.round(diff / HOUR);
    return `${h}h ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate();
  const time = then.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isYesterday) return `yesterday at ${time}`;

  const date = then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date} at ${time}`;
}

/** Absolute timestamp for the bubble's hover tooltip. */
export function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Decide if two consecutive messages should be visually merged into a single
 * block (same author, within 5 minutes). The bubble that follows a merged
 * sibling hides the avatar+name header to read like a continuation.
 */
export function shouldGroupWith(
  prev: { authorId: string; createdAt: string } | null,
  current: { authorId: string; createdAt: string },
): boolean {
  if (!prev) return false;
  if (prev.authorId !== current.authorId) return false;
  const dt =
    new Date(current.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return dt >= 0 && dt < 5 * MIN;
}

/** Day separator label (e.g. "Today", "Yesterday", "May 1, 2026"). */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return then.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Whether two ISO timestamps fall on the same calendar day in local time. */
export function isSameDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Deterministic color for an author's fallback initials avatar. Hash is a
 * tiny FNV-1a so the same userId always picks the same color — feels stable
 * across sessions. Palette intentionally narrow (8 entries) so a roster of
 * ~12 members has roughly even visual coverage and high contrast against
 * white text.
 */
const AVATAR_COLORS = [
  "#F26522", // brand orange
  "#3B82F6", // blue
  "#A855F7", // purple
  "#22C55E", // green
  "#EAB308", // amber
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#0F172A", // navy
];

export function avatarColorForUserId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initialsFor(displayName: string | null, userId: string): string {
  const name = (displayName ?? "").trim();
  if (!name) return userId.slice(0, 2).toUpperCase();
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
