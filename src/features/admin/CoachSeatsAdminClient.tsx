"use client";

import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import {
  setSeatDefaultsAction,
  setCoachBonusSeatsByEmailAction,
  type CoachBonusRow,
} from "@/app/actions/admin-seat-config";
import type { SeatDefaults } from "@/lib/site/seat-defaults-config";

export function CoachSeatsAdminClient({
  initialDefaults,
  initialBonusRows,
}: {
  initialDefaults: SeatDefaults;
  initialBonusRows: CoachBonusRow[];
}) {
  const { toast } = useToast();

  const [savedDefaults, setSavedDefaults] = useState(initialDefaults);
  const [coachInput, setCoachInput] = useState(String(initialDefaults.coach));
  const [coachProInput, setCoachProInput] = useState(String(initialDefaults.coachPro));
  const [coachPending, startCoachTransition] = useTransition();
  const [coachProPending, startCoachProTransition] = useTransition();

  const [rows, setRows] = useState<CoachBonusRow[]>(initialBonusRows);
  const [emailInput, setEmailInput] = useState("");
  const [bonusInput, setBonusInput] = useState("1");
  const [grantPending, startGrantTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function saveCoachDefault() {
    const next = Number(coachInput);
    if (!Number.isFinite(next) || next < 0 || next > 1000) {
      toast("Enter a number between 0 and 1000.", "error");
      setCoachInput(String(savedDefaults.coach));
      return;
    }
    const rounded = Math.floor(next);
    if (rounded === savedDefaults.coach) return;
    startCoachTransition(async () => {
      const res = await setSeatDefaultsAction({ coach: rounded });
      if (!res.ok) {
        toast(res.error, "error");
        setCoachInput(String(savedDefaults.coach));
        return;
      }
      setSavedDefaults(res.defaults);
      setCoachInput(String(res.defaults.coach));
      toast(`Team Coach default set to ${res.defaults.coach} seats.`, "success");
    });
  }

  function saveCoachProDefault() {
    const next = Number(coachProInput);
    if (!Number.isFinite(next) || next < 0 || next > 1000) {
      toast("Enter a number between 0 and 1000.", "error");
      setCoachProInput(String(savedDefaults.coachPro));
      return;
    }
    const rounded = Math.floor(next);
    if (rounded === savedDefaults.coachPro) return;
    startCoachProTransition(async () => {
      const res = await setSeatDefaultsAction({ coachPro: rounded });
      if (!res.ok) {
        toast(res.error, "error");
        setCoachProInput(String(savedDefaults.coachPro));
        return;
      }
      setSavedDefaults(res.defaults);
      setCoachProInput(String(res.defaults.coachPro));
      toast(`Coach Pro default set to ${res.defaults.coachPro} seats.`, "success");
    });
  }

  function grantBonus() {
    const email = emailInput.trim();
    const bonus = Number(bonusInput);
    if (!email) {
      toast("Enter the user's email.", "error");
      return;
    }
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 1000) {
      toast("Bonus must be between 0 and 1000.", "error");
      return;
    }
    startGrantTransition(async () => {
      const res = await setCoachBonusSeatsByEmailAction(email, Math.floor(bonus));
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.ownerId === res.row.ownerId);
        if (idx === -1) {
          return [res.row, ...prev].sort((a, b) =>
            a.bonusSeats !== b.bonusSeats
              ? b.bonusSeats - a.bonusSeats
              : (a.email ?? "").localeCompare(b.email ?? ""),
          );
        }
        const next = prev.slice();
        next[idx] = res.row;
        return next.sort((a, b) =>
          a.bonusSeats !== b.bonusSeats
            ? b.bonusSeats - a.bonusSeats
            : (a.email ?? "").localeCompare(b.email ?? ""),
        );
      });
      setEmailInput("");
      setBonusInput("1");
      toast(
        res.row.bonusSeats === 0
          ? `Bonus seats cleared for ${res.row.email}.`
          : `${res.row.email} now has +${res.row.bonusSeats} bonus seat${res.row.bonusSeats === 1 ? "" : "s"}.`,
        "success",
      );
    });
  }

  function updateRowBonus(row: CoachBonusRow, nextBonus: number) {
    if (!row.email) {
      toast("This account has no email on file — can't grant from this UI.", "error");
      return;
    }
    if (nextBonus === row.bonusSeats) return;
    setUpdatingId(row.ownerId);
    setCoachBonusSeatsByEmailAction(row.email, nextBonus)
      .then((res) => {
        setUpdatingId(null);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        setRows((prev) =>
          prev
            .map((r) => (r.ownerId === res.row.ownerId ? res.row : r))
            .sort((a, b) =>
              a.bonusSeats !== b.bonusSeats
                ? b.bonusSeats - a.bonusSeats
                : (a.email ?? "").localeCompare(b.email ?? ""),
            ),
        );
      })
      .catch((e: unknown) => {
        setUpdatingId(null);
        toast(e instanceof Error ? e.message : "Save failed.", "error");
      });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <p className="text-sm font-semibold text-foreground">Default seats per tier</p>
        <p className="mt-0.5 text-xs text-muted">
          The number of coach seats included with each paid plan, before
          per-seat add-ons. Drives the seat count shown on the pricing
          page, the FAQ, the Account → Coach seats card, and seat-cap
          enforcement everywhere. Changes apply immediately for all
          owners on that tier (unless they have a per-coach bonus, which
          stacks on top).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Team Coach</p>
              <p className="text-[11px] text-muted">Default 3.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                className="w-20 rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
                value={coachInput}
                disabled={coachPending}
                onChange={(e) => setCoachInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCoachDefault();
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={coachPending}
                disabled={
                  coachPending ||
                  coachInput.trim() === "" ||
                  Number(coachInput) === savedDefaults.coach
                }
                onClick={saveCoachDefault}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Coach Pro</p>
              <p className="text-[11px] text-muted">Default 5. Beta-gated tier.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                className="w-20 rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
                value={coachProInput}
                disabled={coachProPending}
                onChange={(e) => setCoachProInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCoachProDefault();
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={coachProPending}
                disabled={
                  coachProPending ||
                  coachProInput.trim() === "" ||
                  Number(coachProInput) === savedDefaults.coachPro
                }
                onClick={saveCoachProDefault}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <p className="text-sm font-semibold text-foreground">Per-coach bonus seats</p>
        <p className="mt-0.5 text-xs text-muted">
          Comp extra seats to a paying coach on top of their tier default.
          Additive — if the tier default later changes, their total moves
          with it. Only Team Coach / Coach Pro accounts can receive a
          bonus.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[14rem] flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Coach email
            </span>
            <input
              type="email"
              placeholder="coach@example.com"
              className="rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
              value={emailInput}
              disabled={grantPending}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </label>
          <label className="flex w-28 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Bonus
            </span>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              className="rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
              value={bonusInput}
              disabled={grantPending}
              onChange={(e) => setBonusInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") grantBonus();
              }}
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            loading={grantPending}
            disabled={grantPending || emailInput.trim() === ""}
            onClick={grantBonus}
          >
            Grant
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 text-xs text-muted">No paying coaches yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-1 font-medium">Coach</th>
                  <th className="px-2 py-1 font-medium">Tier</th>
                  <th className="px-2 py-1 font-medium">Bonus</th>
                  <th className="px-2 py-1 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const updating = updatingId === r.ownerId;
                  return (
                    <tr key={r.ownerId}>
                      <td className="px-2 py-2">
                        <div className="text-foreground">{r.displayName ?? r.email ?? "—"}</div>
                        {r.displayName && r.email ? (
                          <div className="text-xs text-muted">{r.email}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted">
                        {r.tier === "coach_ai" ? "Coach Pro" : "Team Coach"}
                      </td>
                      <td className="px-2 py-2 text-foreground">+{r.bonusSeats}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={updating || r.bonusSeats === 0}
                            onClick={() => updateRowBonus(r, r.bonusSeats - 1)}
                            className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            disabled={updating}
                            onClick={() => updateRowBonus(r, r.bonusSeats + 1)}
                            className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                          >
                            +
                          </button>
                          {r.bonusSeats > 0 && (
                            <button
                              type="button"
                              disabled={updating}
                              onClick={() => updateRowBonus(r, 0)}
                              className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
