import { describe, it, expect } from "vitest";
import {
  pickActiveClaim,
  FIRST_RUN_PRIORITY,
  type ModalClaim,
} from "./FirstRunModalQueue";

describe("pickActiveClaim", () => {
  it("returns null when nothing is claiming", () => {
    expect(pickActiveClaim([], false)).toBeNull();
  });

  it("returns null while a blocking gate owns the screen — even with claims", () => {
    const claims: ModalClaim[] = [
      { id: "welcome", priority: FIRST_RUN_PRIORITY.nativeWelcome },
      { id: "referral", priority: FIRST_RUN_PRIORITY.engagementAsk },
    ];
    expect(pickActiveClaim(claims, true)).toBeNull();
  });

  it("shows the highest-priority claim (native welcome before referral)", () => {
    const claims: ModalClaim[] = [
      { id: "referral", priority: FIRST_RUN_PRIORITY.engagementAsk },
      { id: "welcome", priority: FIRST_RUN_PRIORITY.nativeWelcome },
    ];
    expect(pickActiveClaim(claims, false)).toBe("welcome");
  });

  it("promotes the next claim once the higher one drops out (sequencing)", () => {
    // welcome dismissed → only the referral remains → it becomes active.
    const afterWelcomeDismissed: ModalClaim[] = [
      { id: "referral", priority: FIRST_RUN_PRIORITY.engagementAsk },
    ];
    expect(pickActiveClaim(afterWelcomeDismissed, false)).toBe("referral");
  });

  it("breaks ties by registration order (first registered wins)", () => {
    const claims: ModalClaim[] = [
      { id: "a", priority: 100 },
      { id: "b", priority: 100 },
    ];
    expect(pickActiveClaim(claims, false)).toBe("a");
  });
});
