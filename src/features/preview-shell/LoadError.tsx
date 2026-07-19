/**
 * Shell load-failure surface. A failed server action returns empty data (a bad
 * column 400s the whole query → data:null), so rendering the normal empty state
 * would disguise a real error as "nothing here yet". Show the error instead.
 */
export function LoadError({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-danger/40 bg-danger-light/40 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">Couldn&rsquo;t load this.</p>
      {message && <p className="mt-1 text-xs text-muted">{message}</p>}
      <p className="mt-2 text-xs text-muted">Check your connection and try again.</p>
    </div>
  );
}
