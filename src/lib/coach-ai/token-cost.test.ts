import { describe, expect, it } from "vitest";
import { costMicros, isPricedModel } from "./token-cost";

const zeroUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

describe("costMicros", () => {
  it("prices Haiku 4.5 input/output at published rates", () => {
    // 1M input @ $1 = $1 = 1_000_000 micros
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        ...zeroUsage,
        input_tokens: 1_000_000,
      }),
    ).toBe(1_000_000);
    // 1M output @ $5 = $5 = 5_000_000 micros
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        ...zeroUsage,
        output_tokens: 1_000_000,
      }),
    ).toBe(5_000_000);
  });

  it("prices Opus 4.7 input/output at published rates", () => {
    expect(
      costMicros("claude-opus-4-7", { ...zeroUsage, input_tokens: 1_000_000 }),
    ).toBe(15_000_000);
    expect(
      costMicros("claude-opus-4-7", { ...zeroUsage, output_tokens: 1_000_000 }),
    ).toBe(75_000_000);
  });

  it("applies cache-read discount (10% of input)", () => {
    // 1M cache read on Haiku @ $0.10 = $0.10 = 100_000 micros
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        ...zeroUsage,
        cache_read_input_tokens: 1_000_000,
      }),
    ).toBe(100_000);
  });

  it("applies cache-write premium (125% of input)", () => {
    // 1M cache write on Haiku @ $1.25 = 1_250_000 micros
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        ...zeroUsage,
        cache_creation_input_tokens: 1_000_000,
      }),
    ).toBe(1_250_000);
  });

  it("sums all four token types correctly", () => {
    // 1k input + 500 output + 200 cache read + 100 cache write on Haiku.
    // = 1000*1 + 500*5 + 200*0.10 + 100*1.25  (per M) → / 1M → micros
    // = (1000 + 2500 + 20 + 125) / 1_000_000 USD = 3645 / 1_000_000 USD
    // = 3645 micro-USD
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 100,
      }),
    ).toBe(3645);
  });

  it("matches date-suffixed model variants by prefix", () => {
    // Anthropic occasionally returns suffixed ids; prefix-match keeps the
    // pricing table compact.
    expect(
      costMicros("claude-opus-4-7-20260101", {
        ...zeroUsage,
        input_tokens: 1_000_000,
      }),
    ).toBe(15_000_000);
  });

  it("returns 0 for unknown models rather than guessing", () => {
    expect(
      costMicros("gpt-4o-mini", { ...zeroUsage, input_tokens: 1_000_000 }),
    ).toBe(0);
  });
});

describe("isPricedModel", () => {
  it("recognizes priced and unpriced models", () => {
    expect(isPricedModel("claude-haiku-4-5-20251001")).toBe(true);
    expect(isPricedModel("claude-opus-4-7")).toBe(true);
    expect(isPricedModel("claude-opus-4-7-20260101")).toBe(true);
    expect(isPricedModel("gpt-4o-mini")).toBe(false);
  });
});
