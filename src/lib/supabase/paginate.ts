// PostgREST caps every response at 1000 rows regardless of what `.limit()`
// requests. `fetchAllRows` works around that by issuing successive
// `.range(from, to)` calls until a partial page comes back.
//
// Pass a `buildQuery` factory that returns a fresh Supabase query with all
// filters/ordering already applied (but no `.range` or `.limit`). The helper
// chains `.range()` onto each call.

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_HARD_MAX = 500_000;

export async function fetchAllRows<T>(
  buildQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
  options: { pageSize?: number; hardMax?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const hardMax = options.hardMax ?? DEFAULT_HARD_MAX;
  const out: T[] = [];
  let from = 0;
  while (out.length < hardMax) {
    const to = Math.min(from + pageSize - 1, hardMax - 1);
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from = to + 1;
  }
  return out;
}
