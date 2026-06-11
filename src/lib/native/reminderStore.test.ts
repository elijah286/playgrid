import { describe, expect, it } from "vitest";
import { nextReminderId, prunePast, type Reminder } from "./reminderStore";

const at = (iso: string): Reminder => ({ id: 1, title: "x", at: iso });

describe("reminderStore pure helpers", () => {
  describe("prunePast", () => {
    const now = Date.parse("2026-06-11T12:00:00Z");

    it("keeps future reminders and drops past ones", () => {
      const reminders = [
        { ...at("2026-06-11T11:59:00Z"), id: 1 }, // past
        { ...at("2026-06-11T12:30:00Z"), id: 2 }, // future
        { ...at("2026-06-12T09:00:00Z"), id: 3 }, // future
      ];
      expect(prunePast(reminders, now).map((r) => r.id)).toEqual([2, 3]);
    });

    it("drops reminders with an unparseable datetime", () => {
      const reminders = [{ ...at("not-a-date"), id: 9 }];
      expect(prunePast(reminders, now)).toEqual([]);
    });

    it("treats the exact `now` instant as past (strictly future only)", () => {
      const reminders = [{ ...at("2026-06-11T12:00:00Z"), id: 1 }];
      expect(prunePast(reminders, now)).toEqual([]);
    });
  });

  describe("nextReminderId", () => {
    it("returns 1 for an empty set", () => {
      expect(nextReminderId([])).toBe(1);
    });

    it("returns max(id)+1 so ids stay unique", () => {
      expect(
        nextReminderId([
          { ...at("2026-06-12T09:00:00Z"), id: 3 },
          { ...at("2026-06-12T09:00:00Z"), id: 7 },
        ]),
      ).toBe(8);
    });
  });
});
