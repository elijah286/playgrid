import { describe, expect, it } from "vitest";
import { banTargetError } from "./ban-guards";

describe("banTargetError", () => {
  it("blocks banning yourself", () => {
    expect(
      banTargetError({ actorUserId: "u1", targetUserId: "u1", targetRole: "viewer" }),
    ).toMatch(/yourself/i);
  });

  it("blocks banning the playbook owner", () => {
    expect(
      banTargetError({ actorUserId: "u1", targetUserId: "u2", targetRole: "owner" }),
    ).toMatch(/owner/i);
  });

  it("allows banning a normal member", () => {
    expect(
      banTargetError({ actorUserId: "u1", targetUserId: "u2", targetRole: "viewer" }),
    ).toBeNull();
    expect(
      banTargetError({ actorUserId: "u1", targetUserId: "u2", targetRole: "editor" }),
    ).toBeNull();
  });
});
