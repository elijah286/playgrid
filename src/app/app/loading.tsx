/** Skeleton shown while any /app screen loads (inside the shell chrome). */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4" aria-hidden="true">
      <div className="h-6 w-32 animate-pulse rounded bg-surface-inset" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-surface-inset" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-inset" />
        ))}
      </div>
    </div>
  );
}
