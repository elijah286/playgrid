export default function PlaybooksLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="h-9 flex-1 animate-pulse rounded-lg bg-border" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}
