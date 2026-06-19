import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { userSignedInWithApple } from "./provider";

function makeUser(overrides: Partial<User>): User {
  return {
    id: "u1",
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
    ...overrides,
  } as User;
}

describe("userSignedInWithApple", () => {
  it("returns false for null/undefined", () => {
    expect(userSignedInWithApple(null)).toBe(false);
    expect(userSignedInWithApple(undefined)).toBe(false);
  });

  it("detects apple via app_metadata.provider", () => {
    expect(
      userSignedInWithApple(makeUser({ app_metadata: { provider: "apple" } })),
    ).toBe(true);
  });

  it("detects apple via app_metadata.providers array", () => {
    expect(
      userSignedInWithApple(
        makeUser({ app_metadata: { provider: "email", providers: ["email", "apple"] } }),
      ),
    ).toBe(true);
  });

  it("detects apple via identities", () => {
    expect(
      userSignedInWithApple(
        makeUser({
          app_metadata: {},
          identities: [
            { identity_id: "i1", provider: "apple", id: "x", user_id: "u1", identity_data: {}, created_at: "", last_sign_in_at: "", updated_at: "" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false for google/email-only users", () => {
    expect(
      userSignedInWithApple(
        makeUser({ app_metadata: { provider: "google", providers: ["google"] } }),
      ),
    ).toBe(false);
    expect(
      userSignedInWithApple(makeUser({ app_metadata: { provider: "email" } })),
    ).toBe(false);
  });
});
