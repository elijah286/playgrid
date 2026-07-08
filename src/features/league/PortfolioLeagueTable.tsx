"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PortfolioLeagueRow, PortfolioStatus } from "@/lib/league/console";
import { sportConfig } from "@/lib/league/sportConfig";

function money(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100000).toFixed(1)}k`;
  return `$${Math.round(cents / 100)}`;
}

function sportLabel(row: { sport: string; variant: string | null }): string {
  if (row.variant) return row.variant === "7v7" ? "7v7" : row.variant[0].toUpperCase() + row.variant.slice(1);
  return sportConfig(row.sport).label;
}

const STATUS_META: Record<PortfolioStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "text-emerald-600 dark:text-emerald-400" },
  rostering: { label: "Rostering", cls: "text-sky-600 dark:text-sky-400" },
  setup: { label: "Setup", cls: "text-muted" },
  closed: { label: "Closed", cls: "text-muted" },
};

type SortKey = "name" | "location" | "sport" | "teams" | "registrations" | "fillPct" | "revenuePaidCents" | "attention";

export function PortfolioLeagueTable({ leagues }: { leagues: PortfolioLeagueRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  // Deep-linkable: the portfolio dashboard's needs-attention KPIs link here with
  // ?attn=1 when more than one league contributes, so the filter is pre-applied.
  const [attentionOnly, setAttentionOnly] = useState(() => searchParams.get("attn") === "1");
  const [sortKey, setSortKey] = useState<SortKey>("registrations");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sportOptions = useMemo(
    () => [...new Set(leagues.map((l) => sportLabel(l)))].sort(),
    [leagues],
  );
  const locationOptions = useMemo(
    () => [...new Set(leagues.map((l) => l.location).filter((x): x is string => !!x))].sort(),
    [leagues],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = leagues.filter((l) => {
      if (needle && !l.name.toLowerCase().includes(needle) && !(l.location ?? "").toLowerCase().includes(needle)) return false;
      if (sport && sportLabel(l) !== sport) return false;
      if (location && l.location !== location) return false;
      if (status && l.status !== status) return false;
      if (attentionOnly && l.attention === 0) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    r = [...r].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "name") { av = a.name; bv = b.name; }
      else if (sortKey === "location") { av = a.location ?? ""; bv = b.location ?? ""; }
      else if (sortKey === "sport") { av = sportLabel(a); bv = sportLabel(b); }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return r;
  }, [leagues, q, sport, location, status, attentionOnly, sortKey, sortDir]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "location" || k === "sport" ? "asc" : "desc");
    }
  }

  const selectCls =
    "rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none";
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");
  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => sortBy(k)} className="hover:text-foreground">
        {label}
        {arrow(k)}
      </button>
    </th>
  );

  return (
    <div id="league-table" className="scroll-mt-4">
      {/* facet bar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-foreground">Leagues</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-36 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none sm:w-44"
        />
        <select value={sport} onChange={(e) => setSport(e.target.value)} className={selectCls}>
          <option value="">All sports</option>
          {sportOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls}>
          <option value="">All cities</option>
          {locationOptions.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="rostering">Rostering</option>
          <option value="setup">Setup</option>
        </select>
        <button
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            attentionOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-foreground hover:bg-foreground/5"
          }`}
        >
          Needs attention
        </button>
      </div>

      {/* Mobile: a tappable card per league. A 9-column table can only be read on
          a phone by scrolling it sideways, so below sm we swap to cards that fit the
          viewport. Sorting/filtering share the same `rows`; the header sort buttons
          have no home here, so a compact sort control stands in for them. */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="league-sort" className="text-xs text-muted">Sort</label>
          <select
            id="league-sort"
            value={sortKey}
            onChange={(e) => sortBy(e.target.value as SortKey)}
            className={`${selectCls} flex-1`}
          >
            <option value="registrations">Registrations</option>
            <option value="name">Name</option>
            <option value="teams">Teams</option>
            <option value="fillPct">Fill rate</option>
            <option value="revenuePaidCents">Revenue</option>
            <option value="attention">Needs attention</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-foreground/5"
            aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-border px-4 py-10 text-center text-sm text-muted">
            No leagues match these filters.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((l) => {
              const sm = STATUS_META[l.status];
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/league/${l.id}`)}
                    className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface-raised p-4 text-left transition hover:bg-foreground/[0.03]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{l.name}</div>
                        <div className="truncate text-xs text-muted">
                          {(l.location ?? "—")} · {sportLabel(l)}
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs">
                        <span className={sm.cls}>●</span>
                        <span className="text-foreground">{sm.label}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>
                        <span className="font-medium tabular-nums text-foreground">{l.teams}</span> teams
                      </span>
                      <span>
                        <span className="font-medium tabular-nums text-foreground">{l.registrations}</span> reg.
                      </span>
                      <span>
                        <span className="font-medium tabular-nums text-foreground">
                          {l.capacity > 0 ? `${Math.round(l.fillPct * 100)}%` : "—"}
                        </span>{" "}
                        fill
                      </span>
                      <span className="font-medium tabular-nums text-foreground">
                        {money(l.revenuePaidCents)}
                      </span>
                      {l.attention > 0 ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          ⚑ {l.attention}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop: the full sortable table, kept behind sm so it never forces the
          page to scroll sideways on a phone. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border sm:block">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-surface-raised text-xs text-muted">
            <tr>
              <Th k="name" label="League" />
              <Th k="location" label="City" />
              <Th k="sport" label="Sport" />
              <Th k="teams" label="Teams" right />
              <Th k="registrations" label="Reg." right />
              <Th k="fillPct" label="Fill" right />
              <Th k="revenuePaidCents" label="Revenue" right />
              <th className="px-3 py-2 font-medium">Status</th>
              <Th k="attention" label="⚑" right />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted">
                  No leagues match these filters.
                </td>
              </tr>
            ) : (
              rows.map((l) => {
                const sm = STATUS_META[l.status];
                return (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/league/${l.id}`)}
                    className="cursor-pointer hover:bg-foreground/[0.03]"
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">{l.name}</td>
                    <td className="px-3 py-2.5 text-muted">{l.location ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{sportLabel(l)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.teams}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.registrations}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {l.capacity > 0 ? `${Math.round(l.fillPct * 100)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{money(l.revenuePaidCents)}</td>
                    <td className="px-3 py-2.5">
                      <span className={sm.cls}>●</span> <span className="text-foreground">{sm.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {l.attention > 0 ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          {l.attention}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        {rows.length} of {leagues.length} leagues
      </p>
    </div>
  );
}
