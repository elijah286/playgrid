export default function PlaybookDetailLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-4 w-24 animate-pulse rounded bg-border" />
        <div className="mt-3 h-8 w-48 animate-pulse rounded-lg bg-border" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="h-9 flex-1 animate-pulse rounded-lg bg-border" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}
