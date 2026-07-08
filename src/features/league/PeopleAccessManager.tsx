"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";

import {
  CAPABILITIES,
  ROLE_PRESETS,
  capabilitiesForRole,
  roleForCapabilities,
  type AccessScope,
  type Capability,
} from "@/lib/league/access-control";
import {
  revokeAccessGrantAction,
  upsertAccessGrantAction,
  type AccessGrantRow,
  type AccessLeague,
  type AccessOverview,
} from "@/app/actions/league-access";

const ROLE_KEYS = Object.keys(ROLE_PRESETS);

function roleLabel(role: string): string {
  return role === "custom" ? "Custom" : ROLE_PRESETS[role]?.label ?? role;
}

function sportLabelOf(sport: string): string {
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

type EditState = {
  email: string;
  isNew: boolean;
  role: string;
  caps: Capability[];
  scope: AccessScope;
};

export function PeopleAccessManager({ initial }: { initial: AccessOverview }) {
  const { leagues, groups } = initial;
  const [grants, setGrants] = useState<AccessGrantRow[]>(initial.grants);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sports = useMemo(
    () => [...new Set(leagues.map((l) => l.sport))].sort(),
    [leagues],
  );

  function scopeSummary(scope: AccessScope): string {
    switch (scope.kind) {
      case "portfolio":
        return "Entire portfolio";
      case "leagues":
        return scope.leagueIds.length === 1 ? "1 league" : `${scope.leagueIds.length} leagues`;
      case "sport": {
        const n = leagues.filter((l) => l.sport === scope.sport).length;
        return `${sportLabelOf(scope.sport)} · ${n} league${n === 1 ? "" : "s"}`;
      }
      case "group":
        return groups.find((g) => g.id === scope.groupId)?.name ?? "League group";
    }
  }

  function openInvite() {
    setMsg(null);
    setEditing({
      email: "",
      isNew: true,
      role: "league_manager",
      caps: capabilitiesForRole("league_manager"),
      scope: { kind: "portfolio" },
    });
  }
  function openEdit(g: AccessGrantRow) {
    setMsg(null);
    setEditing({ email: g.email, isNew: false, role: g.role, caps: g.capabilities, scope: g.scope });
  }

  function setRole(role: string) {
    setEditing((e) => (e ? { ...e, role, caps: capabilitiesForRole(role) } : e));
  }
  function toggleCap(cap: Capability) {
    setEditing((e) => {
      if (!e) return e;
      const caps = e.caps.includes(cap) ? e.caps.filter((c) => c !== cap) : [...e.caps, cap];
      return { ...e, caps, role: roleForCapabilities(caps) };
    });
  }
  function setScope(scope: AccessScope) {
    setEditing((e) => (e ? { ...e, scope } : e));
  }

  function save() {
    if (!editing) return;
    setMsg(null);
    startTransition(async () => {
      const r = await upsertAccessGrantAction({
        email: editing.email,
        role: editing.role,
        capabilities: editing.caps,
        scope: editing.scope,
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      const email = editing.email.trim().toLowerCase();
      const row: AccessGrantRow = {
        id: grants.find((g) => g.email === email)?.id ?? `tmp-${email}`,
        email,
        role: editing.role,
        capabilities: editing.caps,
        scope: editing.scope,
        status: "active",
      };
      setGrants((prev) => {
        const others = prev.filter((g) => g.email !== email);
        return [...others, row];
      });
      setEditing(null);
    });
  }

  function revoke(g: AccessGrantRow) {
    if (!globalThis.confirm(`Remove ${g.email}'s access?`)) return;
    startTransition(async () => {
      const r = await revokeAccessGrantAction(g.id);
      if (r.ok) setGrants((prev) => prev.filter((x) => x.id !== g.id));
      else setMsg(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {grants.length} member{grants.length === 1 ? "" : "s"} · invite by email and scope what they can do
        </p>
        <button
          type="button"
          onClick={openInvite}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          + Invite member
        </button>
      </div>

      {msg ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">{msg}</p> : null}

      {/* MEMBERS TABLE */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-surface-raised text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Member</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Scope</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grants.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                  No one else has access yet. Invite a teammate to delegate work.
                </td>
              </tr>
            ) : (
              grants.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{g.email}</td>
                  <td className="px-4 py-3 text-muted">{roleLabel(g.role)}</td>
                  <td className="px-4 py-3 text-muted">{scopeSummary(g.scope)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => openEdit(g)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-foreground/5">
                        Edit
                      </button>
                      <button type="button" disabled={pending} onClick={() => revoke(g)} className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200">
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ACCESS EDITOR */}
      {editing ? (
        <AccessEditor
          editing={editing}
          leagues={leagues}
          groups={groups}
          sports={sports}
          pending={pending}
          onEmail={(email) => setEditing((e) => (e ? { ...e, email } : e))}
          onRole={setRole}
          onToggleCap={toggleCap}
          onScope={setScope}
          onCancel={() => setEditing(null)}
          onSave={save}
          scopeSummary={scopeSummary}
        />
      ) : null}
    </div>
  );
}

function AccessEditor(props: {
  editing: EditState;
  leagues: AccessLeague[];
  groups: { id: string; name: string }[];
  sports: string[];
  pending: boolean;
  onEmail: (v: string) => void;
  onRole: (r: string) => void;
  onToggleCap: (c: Capability) => void;
  onScope: (s: AccessScope) => void;
  onCancel: () => void;
  onSave: () => void;
  scopeSummary: (s: AccessScope) => string;
}) {
  const { editing, leagues, groups, sports } = props;
  const [leagueFilter, setLeagueFilter] = useState("");

  const filteredLeagues = leagueFilter
    ? leagues.filter((l) => l.sport === leagueFilter)
    : leagues;
  const selectedLeagueIds = editing.scope.kind === "leagues" ? editing.scope.leagueIds : [];

  function toggleLeague(id: string) {
    const cur = new Set(selectedLeagueIds);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    props.onScope({ kind: "leagues", leagueIds: [...cur] });
  }
  function selectAllFiltered() {
    props.onScope({ kind: "leagues", leagueIds: filteredLeagues.map((l) => l.id) });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-foreground">
          {editing.isNew ? "Invite member" : `Editing access — ${editing.email}`}
        </span>
      </div>
      {editing.isNew ? (
        <div className="border-b border-border px-4 py-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input
              value={editing.email}
              onChange={(e) => props.onEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="mt-1 w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
      ) : null}

      <div className="grid gap-0 sm:grid-cols-2">
        {/* SCOPE */}
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">1 · Where (scope)</div>
          <div className="space-y-1.5 text-sm">
            <ScopeRadio label="Entire portfolio" hint="all current & future leagues" checked={editing.scope.kind === "portfolio"} onSelect={() => props.onScope({ kind: "portfolio" })} />
            <ScopeRadio label="By sport" checked={editing.scope.kind === "sport"} onSelect={() => props.onScope({ kind: "sport", sport: sports[0] ?? "" })}>
              {editing.scope.kind === "sport" ? (
                <select
                  value={editing.scope.sport}
                  onChange={(e) => props.onScope({ kind: "sport", sport: e.target.value })}
                  className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  {sports.map((s) => (
                    <option key={s} value={s}>{sportLabelOf(s)}</option>
                  ))}
                </select>
              ) : null}
            </ScopeRadio>
            {groups.length > 0 ? (
              <ScopeRadio label="A group" checked={editing.scope.kind === "group"} onSelect={() => props.onScope({ kind: "group", groupId: groups[0].id })}>
                {editing.scope.kind === "group" ? (
                  <select
                    value={editing.scope.groupId}
                    onChange={(e) => props.onScope({ kind: "group", groupId: e.target.value })}
                    className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                ) : null}
              </ScopeRadio>
            ) : null}
            <ScopeRadio label="Specific leagues" checked={editing.scope.kind === "leagues"} onSelect={() => props.onScope({ kind: "leagues", leagueIds: [] })}>
              {editing.scope.kind === "leagues" ? (
                <div className="mt-1.5">
                  <div className="mb-1 flex items-center gap-2">
                    <select value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none">
                      <option value="">All sports</option>
                      {sports.map((s) => (<option key={s} value={s}>{sportLabelOf(s)}</option>))}
                    </select>
                    <button type="button" onClick={selectAllFiltered} className="text-xs text-primary hover:underline">Select all{leagueFilter ? ` ${sportLabelOf(leagueFilter)}` : ""}</button>
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                    {filteredLeagues.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs last:border-b-0">
                        <input type="checkbox" checked={selectedLeagueIds.includes(l.id)} onChange={() => toggleLeague(l.id)} />
                        <span className="text-foreground">{l.name}</span>
                        <span className="ml-auto text-muted">{sportLabelOf(l.sport)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </ScopeRadio>
          </div>
        </div>

        {/* PERMISSIONS */}
        <div className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">2 · What (role)</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ROLE_KEYS.map((rk) => (
              <button
                key={rk}
                type="button"
                onClick={() => props.onRole(rk)}
                className={`rounded-full px-2.5 py-1 text-xs ${editing.role === rk ? "border-2 border-primary font-medium text-foreground" : "border border-border text-muted hover:bg-foreground/5"}`}
              >
                {ROLE_PRESETS[rk].label}
              </button>
            ))}
            <span className={`rounded-full px-2.5 py-1 text-xs ${editing.role === "custom" ? "border-2 border-primary font-medium text-foreground" : "border border-border text-muted"}`}>
              {editing.role === "custom" ? "Custom" : "Custom…"}
            </span>
          </div>
          <div className="mb-1 text-[11px] text-muted">Capabilities</div>
          <div className="grid grid-cols-1 gap-y-1 sm:grid-cols-2 sm:gap-x-3">
            {CAPABILITIES.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm" title={c.description}>
                <input type="checkbox" checked={editing.caps.includes(c.key)} onChange={() => props.onToggleCap(c.key)} />
                <span className={editing.caps.includes(c.key) ? "text-foreground" : "text-muted"}>{c.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted">{props.scopeSummary(editing.scope)} · {editing.caps.length} permission{editing.caps.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={props.onCancel} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-foreground/5">Cancel</button>
            <button type="button" disabled={props.pending || !editing.email.trim()} onClick={props.onSave} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
              {props.pending ? "Saving…" : "Save access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopeRadio({
  label,
  hint,
  checked,
  onSelect,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${checked ? "border-primary bg-primary/5" : "border-border"}`}>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="radio" checked={checked} onChange={onSelect} />
        <span className="font-medium text-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted">— {hint}</span> : null}
      </label>
      {children}
    </div>
  );
}
