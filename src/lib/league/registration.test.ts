import { describe, it, expect } from "vitest";

import {
  REGISTRATION_STATUSES,
  canTransition,
  allowedTransitions,
  isUnrostered,
  isActiveRegistration,
  type RegistrationStatus,
} from "./registration";

describe("registration status transitions", () => {
  it("allows the documented forward moves", () => {
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(canTransition("approved", "rostered")).toBe(true);
    expect(canTransition("waitlisted", "approved")).toBe(true);
    expect(canTransition("rejected", "submitted")).toBe(true);
  });

  it("rejects illegal moves", () => {
    expect(canTransition("submitted", "rostered")).toBe(false); // must be approved first
    expect(canTransition("rostered", "approved")).toBe(false);
    expect(canTransition("withdrawn", "submitted")).toBe(false); // terminal
  });

  it("rostered can only be withdrawn", () => {
    const from: RegistrationStatus = "rostered";
    const targets = REGISTRATION_STATUSES.filter((s) => canTransition(from, s));
    expect(targets).toEqual(["withdrawn"]);
  });

  it("withdrawn is terminal", () => {
    expect(allowedTransitions("withdrawn")).toEqual([]);
  });

  it("never allows a no-op self-transition", () => {
    for (const s of REGISTRATION_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

describe("registration status predicates", () => {
  it("flags approved/waitlisted as needing a roster home", () => {
    expect(isUnrostered("approved")).toBe(true);
    expect(isUnrostered("waitlisted")).toBe(true);
    expect(isUnrostered("rostered")).toBe(false);
    expect(isUnrostered("submitted")).toBe(false);
  });

  it("counts approved/rostered/waitlisted as active", () => {
    expect(isActiveRegistration("rostered")).toBe(true);
    expect(isActiveRegistration("approved")).toBe(true);
    expect(isActiveRegistration("waitlisted")).toBe(true);
    expect(isActiveRegistration("rejected")).toBe(false);
    expect(isActiveRegistration("withdrawn")).toBe(false);
  });
});
