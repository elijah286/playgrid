"use client";

import { useRouter } from "next/navigation";

/** Console context-bar switcher: jump directly between the operator's leagues
 *  (or back to the portfolio) without returning to /league first. */
export function LeagueSwitcher({
  leagues,
  currentId,
}: {
  leagues: { id: string; name: string }[];
  currentId: string;
}) {
  const router = useRouter();
  return (
    <select
      value={currentId}
      aria-label="Switch league"
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === "__all__" ? "/league" : `/league/${v}`);
      }}
      className="max-w-[60vw] rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:max-w-xs"
    >
      {leagues.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
      <option value="__all__">All leagues…</option>
    </select>
  );
}
