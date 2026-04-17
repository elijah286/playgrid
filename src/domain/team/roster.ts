import { z } from "zod";

export const playbookRosterSchema = z.object({
  staff: z.array(z.string().trim().min(1)).default([]),
  players: z.array(z.string().trim().min(1)).default([]),
});

export type PlaybookRoster = z.infer<typeof playbookRosterSchema>;

export const EMPTY_ROSTER: PlaybookRoster = { staff: [], players: [] };

export function parsePlaybookRoster(raw: unknown): PlaybookRoster {
  const parsed = playbookRosterSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_ROSTER;
}

export function rosterFromLines(staffText: string, playersText: string): PlaybookRoster {
  const split = (s: string) =>
    s
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  return { staff: split(staffText), players: split(playersText) };
}
