/**
 * Small black chip showing a play's number, positioned in the top-left
 * corner of a thumbnail/field. Mirrors the printed playsheet glyph so
 * coaches in game mode see the same identifier as on their wristband.
 *
 * Parent must be `relative` for the absolute positioning to anchor.
 */
export function PlayNumberBadge({
  value,
  size = "sm",
}: {
  value: string;
  size?: "sm" | "md";
}) {
  const cls =
    size === "md"
      ? "left-1.5 top-1.5 px-1.5 py-0.5 text-xs"
      : "left-1 top-1 px-1 py-px text-[10px]";
  return (
    <span
      aria-hidden
      className={
        "pointer-events-none absolute z-10 rounded-sm bg-slate-900 font-bold tracking-tight text-white shadow-sm " +
        cls
      }
    >
      {value}
    </span>
  );
}
