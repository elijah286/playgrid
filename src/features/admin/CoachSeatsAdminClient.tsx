"use client";

import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import {
  setSeatDefaultsAction,
  setCoachBonusSeatsByEmailAction,
  setCoachBonusMessagesByEmailAction,
  setCoachCalPackConfigAction,
  type CoachBonusRow,
} from "@/app/actions/admin-seat-config";
import type { SeatDefaults } from "@/lib/site/seat-defaults-config";
import type { CoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";

function sortRows(rows: CoachBonusRow[]): CoachBonusRow[] {
  return rows.slice().sort((a, b) => {
    const aTotal = a.bonusSeats + a.bonusMessages;
    const bTotal = b.bonusSeats + b.bonusMessages;
    if (aTotal !== bTotal) return bTotal - aTotal;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });
}

export function CoachSeatsAdminClient({
  initialDefaults,
  initialBonusRows,
  initialPack,
}: {
  initialDefaults: SeatDefaults;
  initialBonusRows: CoachBonusRow[];
  initialPack: CoachCalPackConfig;
}) {
  const { toast } = useToast();

  const [savedDefaults, setSavedDefaults] = useState(initialDefaults);
  const [coachInput, setCoachInput] = useState(String(initialDefaults.coach));
  const [coachProInput, setCoachProInput] = useState(String(initialDefaults.coachPro));
  const [coachPending, startCoachTransition] = useTransition();
  const [coachProPending, startCoachProTransition] = useTransition();

  const [rows, setRows] = useState<CoachBonusRow[]>(sortRows(initialBonusRows));

  const [seatEmail, setSeatEmail] = useState("");
  const [seatBonus, setSeatBonus] = useState("1");
  const [seatGrantPending, startSeatGrantTransition] = useTransition();
  const [updatingSeatsId, setUpdatingSeatsId] = useState<string | null>(null);

  const [msgEmail, setMsgEmail] = useState("");
  const [msgBonus, setMsgBonus] = useState("100");
  const [msgGrantPending, startMsgGrantTransition] = useTransition();
  const [updatingMsgId, setUpdatingMsgId] = useState<string | null>(null);

  const [savedPack, setSavedPack] = useState(initialPack);
  const [packSizeInput, setPackSizeInput] = useState(String(initialPack.messageCount));
  const [packPriceInput, setPackPriceInput] = useState(
    (initialPack.priceUsdCents / 100).toFixed(2),
  );
  const [packPending, startPackTransition] = useTransition();

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

  function mergeRow(row: CoachBonusRow) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.ownerId === row.ownerId);
      const next = idx === -1 ? [row, ...prev] : prev.map((r) => (r.ownerId === row.ownerId ? row : r));
      return sortRows(next);
    });
  }

  function grantSeats() {
    const email = seatEmail.trim();
    const bonus = Number(seatBonus);
    if (!email) {
      toast("Enter the user's email.", "error");
      return;
    }
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 1000) {
      toast("Bonus must be between 0 and 1000.", "error");
      return;
    }
    startSeatGrantTransition(async () => {
      const res = await setCoachBonusSeatsByEmailAction(email, Math.floor(bonus));
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      mergeRow(res.row);
      setSeatEmail("");
      setSeatBonus("1");
      toast(
        res.row.bonusSeats === 0
          ? `Bonus seats cleared for ${res.row.email}.`
          : `${res.row.email} now has +${res.row.bonusSeats} bonus seat${res.row.bonusSeats === 1 ? "" : "s"}.`,
        "success",
      );
    });
  }

  function grantMessages() {
    const email = msgEmail.trim();
    const bonus = Number(msgBonus);
    if (!email) {
      toast("Enter the user's email.", "error");
      return;
    }
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 100000) {
      toast("Bonus must be between 0 and 100000.", "error");
      return;
    }
    startMsgGrantTransition(async () => {
      const res = await setCoachBonusMessagesByEmailAction(email, Math.floor(bonus));
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      mergeRow(res.row);
      setMsgEmail("");
      setMsgBonus("100");
      toast(
        res.row.bonusMessages === 0
          ? `Bonus messages cleared for ${res.row.email}.`
          : `${res.row.email} now has +${res.row.bonusMessages} bonus Coach Cal message${res.row.bonusMessages === 1 ? "" : "s"}.`,
        "success",
      );
    });
  }

  function updateRowSeats(row: CoachBonusRow, nextBonus: number) {
    if (!row.email) {
      toast("This account has no email on file — can't grant from this UI.", "error");
      return;
    }
    if (nextBonus === row.bonusSeats) return;
    setUpdatingSeatsId(row.ownerId);
    setCoachBonusSeatsByEmailAction(row.email, nextBonus)
      .then((res) => {
        setUpdatingSeatsId(null);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        mergeRow(res.row);
      })
      .catch((e: unknown) => {
        setUpdatingSeatsId(null);
        toast(e instanceof Error ? e.message : "Save failed.", "error");
      });
  }

  function savePack() {
    const sizeNum = Number(packSizeInput);
    const priceDollars = Number(packPriceInput);
    if (!Number.isFinite(sizeNum) || sizeNum < 1 || sizeNum > 100000) {
      toast("Pack size must be between 1 and 100000.", "error");
      return;
    }
    if (!Number.isFinite(priceDollars) || priceDollars <= 0 || priceDollars > 10000) {
      toast("Pack price must be between $0.01 and $10000.", "error");
      return;
    }
    const nextSize = Math.floor(sizeNum);
    const nextCents = Math.round(priceDollars * 100);
    if (nextSize === savedPack.messageCount && nextCents === savedPack.priceUsdCents) return;
    startPackTransition(async () => {
      const res = await setCoachCalPackConfigAction({
        messageCount: nextSize,
        priceUsdCents: nextCents,
      });
      if (!res.ok) {
        toast(res.error, "error");
        setPackSizeInput(String(savedPack.messageCount));
        setPackPriceInput((savedPack.priceUsdCents / 100).toFixed(2));
        return;
      }
      setSavedPack(res.pack);
      setPackSizeInput(String(res.pack.messageCount));
      setPackPriceInput((res.pack.priceUsdCents / 100).toFixed(2));
      toast(
        `Pack: ${res.pack.messageCount} messages for $${(res.pack.priceUsdCents / 100).toFixed(2)}.`,
        "success",
      );
    });
  }

  function clearRowMessages(row: CoachBonusRow) {
    if (!row.email) return;
    setUpdatingMsgId(row.ownerId);
    setCoachBonusMessagesByEmailAction(row.email, 0)
      .then((res) => {
        setUpdatingMsgId(null);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        mergeRow(res.row);
      })
      .catch((e: unknown) => {
        setUpdatingMsgId(null);
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
        <p className="text-sm font-semibold text-foreground">Coach Cal message pack</p>
        <p className="mt-0.5 text-xs text-muted">
          What Coach Pro users see when they hit the monthly message cap.
          Stripe is the source of truth for the actual charge — paste the
          one-time price ID under Integrations → Stripe configuration.
          Keep these numbers in sync with that price so the in-app copy
          matches what gets billed. Packs expire at month rollover.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl border border-border bg-surface p-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Pack size (messages)
            </span>
            <input
              type="number"
              min={1}
              max={100000}
              step={1}
              className="mt-1 block w-full rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
              value={packSizeInput}
              disabled={packPending}
              onChange={(e) => setPackSizeInput(e.target.value)}
            />
          </label>

          <label className="rounded-xl border border-border bg-surface p-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Display price (USD)
            </span>
            <input
              type="number"
              min={0.01}
              max={10000}
              step={0.01}
              className="mt-1 block w-full rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
              value={packPriceInput}
              disabled={packPending}
              onChange={(e) => setPackPriceInput(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            loading={packPending}
            disabled={
              packPending ||
              packSizeInput.trim() === "" ||
              packPriceInput.trim() === "" ||
              (Math.floor(Number(packSizeInput)) === savedPack.messageCount &&
                Math.round(Number(packPriceInput) * 100) === savedPack.priceUsdCents)
            }
            onClick={savePack}
          >
            Save pack
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <p className="text-sm font-semibold text-foreground">Per-coach bonus grants</p>
        <p className="mt-0.5 text-xs text-muted">
          Comp extra seats and/or Coach Cal messages to a paying coach on
          top of their tier defaults. Both are additive — if a tier
          default later changes, totals move with it. Bonus seats apply
          to Team Coach and Coach Pro; bonus messages apply to Coach Pro
          only (Coach Cal is Pro-only).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs font-medium text-foreground">Grant bonus seats</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-1 min-w-[10rem] flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Email</span>
                <input
                  type="email"
                  placeholder="coach@example.com"
                  className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
                  value={seatEmail}
                  disabled={seatGrantPending}
                  onChange={(e) => setSeatEmail(e.target.value)}
                />
              </label>
              <label className="flex w-20 flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Bonus</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
                  value={seatBonus}
                  disabled={seatGrantPending}
                  onChange={(e) => setSeatBonus(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") grantSeats();
                  }}
                />
              </label>
              <Button
                variant="primary"
                size="sm"
                loading={seatGrantPending}
                disabled={seatGrantPending || seatEmail.trim() === ""}
                onClick={grantSeats}
              >
                Grant
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs font-medium text-foreground">Grant bonus Coach Cal messages</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-1 min-w-[10rem] flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Email</span>
                <input
                  type="email"
                  placeholder="coach@example.com"
                  className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
                  value={msgEmail}
                  disabled={msgGrantPending}
                  onChange={(e) => setMsgEmail(e.target.value)}
                />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Bonus</span>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border"
                  value={msgBonus}
                  disabled={msgGrantPending}
                  onChange={(e) => setMsgBonus(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") grantMessages();
                  }}
                />
              </label>
              <Button
                variant="primary"
                size="sm"
                loading={msgGrantPending}
                disabled={msgGrantPending || msgEmail.trim() === ""}
                onClick={grantMessages}
              >
                Grant
              </Button>
            </div>
          </div>
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
                  <th className="px-2 py-1 font-medium">Bonus seats</th>
                  <th className="px-2 py-1 font-medium">Bonus messages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const updatingSeats = updatingSeatsId === r.ownerId;
                  const updatingMsg = updatingMsgId === r.ownerId;
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
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">+{r.bonusSeats}</span>
                          <button
                            type="button"
                            disabled={updatingSeats || r.bonusSeats === 0}
                            onClick={() => updateRowSeats(r, r.bonusSeats - 1)}
                            className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            disabled={updatingSeats}
                            onClick={() => updateRowSeats(r, r.bonusSeats + 1)}
                            className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                          >
                            +
                          </button>
                          {r.bonusSeats > 0 && (
                            <button
                              type="button"
                              disabled={updatingSeats}
                              onClick={() => updateRowSeats(r, 0)}
                              className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">+{r.bonusMessages}</span>
                          {r.tier !== "coach_ai" && r.bonusMessages === 0 ? (
                            <span className="text-[11px] text-muted">(Pro-only)</span>
                          ) : null}
                          {r.bonusMessages > 0 && (
                            <button
                              type="button"
                              disabled={updatingMsg}
                              onClick={() => clearRowMessages(r)}
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
