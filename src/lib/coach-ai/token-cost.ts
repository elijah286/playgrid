// Per-model Anthropic pricing for cost attribution.
//
// Numbers are USD per million tokens, sourced from Anthropic's public
// pricing page as of 2026-07-03. When Anthropic adjusts pricing or we
// add a new model, update PRICING and bump the comment. Cost-tracking
// rows already in the DB are NOT retroactively recomputed — they reflect
// pricing at the time of the turn.
//
// Cache pricing follows Anthropic's published multipliers:
//   - cache_creation_input_tokens: 1.25x base input (5-min ephemeral)
//   - cache_read_input_tokens:     0.10x base input
// These are absorbed into the per-model rates below so callers only
// need to multiply tokens × rate.

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

type ModelRates = {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

// Keys are Anthropic's full model IDs as returned by the API in `model`.
// Match is exact; unknown models fall back to UNKNOWN_RATES (logged so we
// notice — see costMicros).
const PRICING: Record<string, ModelRates> = {
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  // Photo play import models (2026-07).
  "claude-opus-4-8": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  "claude-sonnet-5": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
};

// Sentinel for unknown models. Returns 0 so an unknown model can't bill
// the user something arbitrary, but we log it so the gap is visible in
// Cloud Run logs.
const UNKNOWN_RATES: ModelRates = {
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
};

function ratesFor(modelId: string): ModelRates {
  const exact = PRICING[modelId];
  if (exact) return exact;
  // Anthropic sometimes returns a date-suffixed variant of the model id
  // (e.g. claude-opus-4-7-20260101) — match by prefix as a fallback.
  for (const key of Object.keys(PRICING)) {
    if (modelId.startsWith(key)) return PRICING[key]!;
  }
  return UNKNOWN_RATES;
}

/**
 * Compute cost in micro-USD (1e-6 dollars) for a single SDK response.
 * Returns 0 when the model isn't priced; callers should log that case
 * upstream so the gap doesn't go silent.
 *
 * Micro-USD is the storage unit on `coach_ai_token_usage.cost_micros`
 * (bigint). 1 cent = 10_000 micros; $5 = 5_000_000 micros.
 */
export function costMicros(modelId: string, usage: TokenUsage): number {
  const r = ratesFor(modelId);
  // base input excludes the cache-bucket counts; Anthropic reports the
  // three counts as disjoint slices of the same prefix.
  const baseInput = usage.input_tokens;
  const dollars =
    (baseInput * r.input +
      usage.cache_creation_input_tokens * r.cacheWrite +
      usage.cache_read_input_tokens * r.cacheRead +
      usage.output_tokens * r.output) /
    1_000_000;
  return Math.round(dollars * 1_000_000);
}

export function isPricedModel(modelId: string): boolean {
  return ratesFor(modelId) !== UNKNOWN_RATES;
}
