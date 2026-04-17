/** Compact SVG marks for headers and CTAs — no external icon pack */

export function FootballIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ellipse cx="16" cy="16" rx="13" ry="8.5" className="fill-pg-leather" transform="rotate(-52 16 16)" />
      <path
        d="M9 12c2.5 5.5 11.5 5.5 14 0"
        className="stroke-pg-chalk/50"
        strokeWidth="1.2"
        strokeLinecap="round"
        transform="rotate(-52 16 16)"
      />
      <path
        d="M11 16h10M12 13.5h8M12 18.5h8"
        className="stroke-pg-chalk/35"
        strokeWidth="0.85"
        strokeLinecap="round"
        transform="rotate(-52 16 16)"
      />
    </svg>
  );
}

export function FieldGoalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M6 26h20" className="stroke-pg-line" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10 26V10a6 6 0 0 1 12 0v16"
        className="stroke-pg-chalk"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 14h16M8 10h16" className="stroke-pg-chalk/60" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
