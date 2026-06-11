/**
 * On-device store for game / practice reminders, mirrored in localStorage so
 * the reminders list survives app restarts (the OS scheduler holds the actual
 * notifications). Pure helpers (`prunePast`, `nextReminderId`) are split out so
 * the scheduling math is unit-testable without a browser.
 */

export type Reminder = {
  /** 32-bit int id shared with the OS notification scheduler. */
  id: number;
  title: string;
  /** ISO datetime the reminder should fire. */
  at: string;
};

const KEY = "playgrid:local-reminders";

/** Drop reminders whose fire time has already passed. */
export function prunePast(reminders: Reminder[], now: number): Reminder[] {
  return reminders.filter((r) => {
    const t = new Date(r.at).getTime();
    return Number.isFinite(t) && t > now;
  });
}

/** Next unique id among the current set (we cancel the OS notification on
 *  removal, so ids are safe to reuse once freed). */
export function nextReminderId(reminders: Reminder[]): number {
  return reminders.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

function read(): Reminder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Reminder[]) : [];
  } catch {
    return [];
  }
}

function write(reminders: Reminder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(reminders));
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Load reminders, dropping any that have already fired, sorted soonest-first. */
export function loadReminders(now: number = Date.now()): Reminder[] {
  const pruned = prunePast(read(), now).sort((a, b) => a.at.localeCompare(b.at));
  write(pruned);
  return pruned;
}

/** Persist a new reminder and return it (with its assigned id). */
export function addReminder(input: Omit<Reminder, "id">): Reminder {
  const all = read();
  const reminder: Reminder = { ...input, id: nextReminderId(all) };
  write([...all, reminder]);
  return reminder;
}

/** Remove a reminder from the store by id. */
export function removeReminder(id: number): void {
  write(read().filter((r) => r.id !== id));
}
