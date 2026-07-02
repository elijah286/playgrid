import { describe, it, expect } from "vitest";

import { validate } from "./PublicRegistrationForm";

const VALID = {
  playerFirstName: "Jamie",
  playerLastName: "Rivera",
  guardianName: "Alex Rivera",
  guardianEmail: "alex@example.com",
};

describe("validate", () => {
  it("returns no errors when every required field is filled in", () => {
    expect(validate(VALID)).toEqual({});
  });

  it("flags a missing player first name", () => {
    const errors = validate({ ...VALID, playerFirstName: "" });
    expect(errors.playerFirstName).toBeTruthy();
    expect(errors.playerLastName).toBeUndefined();
  });

  it("flags a whitespace-only player last name the same as empty", () => {
    const errors = validate({ ...VALID, playerLastName: "   " });
    expect(errors.playerLastName).toBeTruthy();
  });

  it("flags a missing guardian name", () => {
    const errors = validate({ ...VALID, guardianName: "" });
    expect(errors.guardianName).toBeTruthy();
  });

  it("flags a missing guardian email distinctly from a malformed one", () => {
    const missing = validate({ ...VALID, guardianEmail: "" });
    expect(missing.guardianEmail).toBe("Enter an email address.");

    const malformed = validate({ ...VALID, guardianEmail: "not-an-email" });
    expect(malformed.guardianEmail).toBe("Enter a valid email address.");
  });

  it("accepts a well-formed email", () => {
    const errors = validate({ ...VALID, guardianEmail: "coach.parent+tag@sub.example.com" });
    expect(errors.guardianEmail).toBeUndefined();
  });

  it("reports every missing required field at once", () => {
    const errors = validate({
      playerFirstName: "",
      playerLastName: "",
      guardianName: "",
      guardianEmail: "",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["guardianEmail", "guardianName", "playerFirstName", "playerLastName"].sort(),
    );
  });
});
