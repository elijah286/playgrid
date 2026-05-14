// Some third-party browser extensions iterate every JSON-LD block on a
// page and call `obj["@context"].toLowerCase()` without checking that the
// key exists, throwing TypeErrors that pollute the console for any user
// who has them installed. The spec lets children inherit context from a
// parent, but explicit @context on every @type-bearing object is also
// valid — and bulletproof against this class of extension bug. We apply
// the helper at the JSON.stringify boundary so each page's structured
// data can stay readable without sprinkling @context lines everywhere.

const SCHEMA_CONTEXT = "https://schema.org";

export function withFullContext<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(withFullContext) as unknown as T;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("@type" in obj && !("@context" in obj)) {
      out["@context"] = SCHEMA_CONTEXT;
    }
    for (const [k, v] of Object.entries(obj)) {
      out[k] = withFullContext(v);
    }
    return out as T;
  }
  return value;
}
