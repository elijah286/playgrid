"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  KeyRound,
  MoreHorizontal,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  createUserAsAdminAction,
  deleteUserAsAdminAction,
  getAdminUserActivityAction,
  getAdminUserStatsAction,
  listUsersForAdminAction,
  setUserPasswordAsAdminAction,
  updateUserAsAdminAction,
  type AdminUserActivity,
  type AdminUserStats,
} from "@/app/actions/admin-users";
import { grantCompAction, revokeCompAction } from "@/app/actions/admin-billing";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { Modal } from "@/components/ui";

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  coach: "Coach",
  coach_ai: "Coach AI",
};

function plusOneYearISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function formatLastSignIn(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTimeOnSite(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min - hr * 60;
  if (hr < 24) return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

type SortKey = "lastSignIn" | "timeOnSite" | "createdAt" | null;
type SortDir = "asc" | "desc";

function formatCreatedAt(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffDay = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (diffDay === 0) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin" | "coach";
  createdAt: string;
  lastSignIn: string | null;
  tier: SubscriptionTier;
  entitlementSource: "comp" | "stripe" | "free";
  entitlementExpiresAt: string | null;
  compGrantId: string | null;
  subscriptionId: string | null;
  totalSecondsOnSite: number | null;
};

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; user: AdminUserRow }
  | { kind: "reset"; user: AdminUserRow }
  | { kind: "plan"; user: AdminUserRow }
  | null;

export function UsersAdminClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUserRow[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lastSignIn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(k: NonNullable<SortKey>) {
    setSortKey((cur) => {
      if (cur !== k) {
        setSortDir("desc");
        return k;
      }
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return cur;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? users
      : users.filter((u) => {
          return (
            u.email.toLowerCase().includes(q) ||
            (u.displayName ?? "").toLowerCase().includes(q)
          );
        });
    if (!sortKey) return matched;
    const sign = sortDir === "asc" ? 1 : -1;
    // Null values always sort to the bottom regardless of direction —
    // "Never" / "—" entries shouldn't pollute the top of either view.
    return [...matched].sort((a, b) => {
      if (sortKey === "lastSignIn") {
        const av = a.lastSignIn ? Date.parse(a.lastSignIn) : null;
        const bv = b.lastSignIn ? Date.parse(b.lastSignIn) : null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * sign;
      }
      if (sortKey === "createdAt") {
        // createdAt is non-null for every row (auth.users.created_at is
        // always set), so we don't need the null-pinning dance — but we
        // still guard against bad parses so a bogus string can't crash
        // the sort.
        const av = Date.parse(a.createdAt);
        const bv = Date.parse(b.createdAt);
        const aOk = !Number.isNaN(av);
        const bOk = !Number.isNaN(bv);
        if (!aOk && !bOk) return 0;
        if (!aOk) return 1;
        if (!bOk) return -1;
        return (av - bv) * sign;
      }
      const av = a.totalSecondsOnSite ?? null;
      const bv = b.totalSecondsOnSite ?? null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sign;
    });
  }, [users, query, sortKey, sortDir]);

  function refresh() {
    startTransition(async () => {
      const res = await listUsersForAdminAction();
      if (res.ok) setUsers(res.users);
      else setMsg({ kind: "error", text: res.error });
    });
  }

  function closeDialog() {
    setDialog(null);
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            msg.kind === "error"
              ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
              : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-light" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email…"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <span className="text-xs text-muted">
            {filtered.length} / {users.length} users
          </span>
          <button
            type="button"
            onClick={() => setDialog({ kind: "add" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            <UserPlus className="size-4" />
            Add user
          </button>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-surface-inset text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plan</th>
              <SortableHeader
                label="Created"
                active={sortKey === "createdAt"}
                dir={sortDir}
                onClick={() => toggleSort("createdAt")}
              />
              <SortableHeader
                label="Last sign in"
                active={sortKey === "lastSignIn"}
                dir={sortDir}
                onClick={() => toggleSort("lastSignIn")}
              />
              <SortableHeader
                label="Time on site"
                active={sortKey === "timeOnSite"}
                dir={sortDir}
                onClick={() => toggleSort("timeOnSite")}
              />
              <th className="w-12 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                  No users match that search.
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const isOpen = expanded === u.id;
                return (
                <Fragment key={u.id}>
                <tr
                  className="cursor-pointer hover:bg-surface-inset/40"
                  onClick={() => setExpanded((cur) => (cur === u.id ? null : u.id))}
                >
                  <td className="px-2 py-3 align-middle text-muted">
                    <ChevronRight
                      className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle font-medium text-foreground">
                    {u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-foreground">
                    {u.displayName ?? <span className="text-muted-light">—</span>}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: "plan", user: u })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-inset"
                      title={
                        u.entitlementSource === "stripe"
                          ? "Stripe subscription"
                          : u.entitlementSource === "comp"
                            ? `Comp grant${u.entitlementExpiresAt ? ` until ${formatExpiry(u.entitlementExpiresAt)}` : ""}`
                            : "Free tier"
                      }
                    >
                      <span
                        className={
                          u.tier === "free"
                            ? "text-muted"
                            : u.tier === "coach_ai"
                              ? "text-primary"
                              : "text-foreground"
                        }
                      >
                        {TIER_LABELS[u.tier]}
                      </span>
                      {u.entitlementSource === "stripe" && (
                        <span className="rounded bg-emerald-500/10 px-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                          stripe
                        </span>
                      )}
                      {u.entitlementSource === "comp" && (
                        <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold uppercase text-primary">
                          comp
                        </span>
                      )}
                    </button>
                  </td>
                  <td
                    className="px-4 py-3 align-middle text-xs text-muted"
                    title={u.createdAt ? new Date(u.createdAt).toLocaleString() : ""}
                  >
                    {formatCreatedAt(u.createdAt)}
                  </td>
                  <td
                    className="px-4 py-3 align-middle text-xs text-muted"
                    title={u.lastSignIn ?? ""}
                  >
                    {formatLastSignIn(u.lastSignIn)}
                  </td>
                  <td
                    className="px-4 py-3 align-middle text-xs text-muted tabular-nums"
                    title={
                      u.totalSecondsOnSite != null
                        ? `${u.totalSecondsOnSite.toLocaleString()} seconds total`
                        : "No active-time recorded"
                    }
                  >
                    {formatTimeOnSite(u.totalSecondsOnSite)}
                  </td>
                  <td
                    className="px-4 py-3 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <UserActionMenu
                      disabled={pending}
                      isSelf={u.id === currentUserId}
                      onEdit={() => setDialog({ kind: "edit", user: u })}
                      onReset={() => setDialog({ kind: "reset", user: u })}
                      onDelete={() => {
                        if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
                        setMsg(null);
                        startTransition(async () => {
                          const res = await deleteUserAsAdminAction(u.id);
                          if (!res.ok) setMsg({ kind: "error", text: res.error });
                          else {
                            setMsg({ kind: "success", text: `Deleted ${u.email}.` });
                            refresh();
                          }
                        });
                      }}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-surface-inset/30">
                    <td colSpan={9} className="px-4 py-4">
                      <UserStatsPanel userId={u.id} />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "add" && (
        <AddUserDialog
          onClose={closeDialog}
          onDone={(note) => {
            closeDialog();
            setMsg({ kind: "success", text: note });
            refresh();
          }}
          onError={(e) => setMsg({ kind: "error", text: e })}
        />
      )}

      {dialog?.kind === "edit" && (
        <EditUserDialog
          user={dialog.user}
          canDemoteSelf={dialog.user.id !== currentUserId}
          onClose={closeDialog}
          onDone={(note) => {
            closeDialog();
            setMsg({ kind: "success", text: note });
            refresh();
          }}
          onError={(e) => setMsg({ kind: "error", text: e })}
        />
      )}

      {dialog?.kind === "reset" && (
        <ResetPasswordDialog
          user={dialog.user}
          onClose={closeDialog}
          onDone={(note) => {
            closeDialog();
            setMsg({ kind: "success", text: note });
          }}
          onError={(e) => setMsg({ kind: "error", text: e })}
        />
      )}

      {dialog?.kind === "plan" && (
        <PlanDialog
          user={dialog.user}
          onClose={closeDialog}
          onDone={(note) => {
            closeDialog();
            setMsg({ kind: "success", text: note });
            refresh();
          }}
          onError={(e) => setMsg({ kind: "error", text: e })}
        />
      )}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th
      className="px-4 py-3"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          )
        ) : (
          <ChevronDown className="size-3 opacity-30" aria-hidden />
        )}
      </button>
    </th>
  );
}

/**
 * Per-user action menu — collapses Edit / Reset password / Delete into a
 * single popover. Keeps row chrome compact so the main columns (Email,
 * Name, Plan, Last sign in, Time on site) have room to breathe and the
 * Plan column doesn't get pushed off-screen on narrower windows.
 */
function UserActionMenu({
  disabled,
  isSelf,
  onEdit,
  onReset,
  onDelete,
}: {
  disabled: boolean;
  isSelf: boolean;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-inset disabled:opacity-50";

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <button
        type="button"
        aria-label="User actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-inset disabled:opacity-50"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className={`${itemCls} text-foreground`}
          >
            <Edit3 className="size-3.5 shrink-0" aria-hidden />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
            className={`${itemCls} text-foreground`}
          >
            <KeyRound className="size-3.5 shrink-0" aria-hidden />
            Reset password
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isSelf}
            title={isSelf ? "You can't delete your own admin account" : undefined}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className={`${itemCls} text-danger`}
          >
            <Trash2 className="size-3.5 shrink-0" aria-hidden />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function PlanDialog({
  user,
  onClose,
  onDone,
  onError,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (msg: string) => void;
}) {
  const [tier, setTier] = useState<SubscriptionTier>(
    user.tier === "free" ? "coach" : user.tier,
  );
  const defaultExpiry = user.entitlementExpiresAt
    ? user.entitlementExpiresAt.slice(0, 10)
    : plusOneYearISO().slice(0, 10);
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiry);
  const [noExpiry, setNoExpiry] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const isStripe = user.entitlementSource === "stripe";
  const isComp = user.entitlementSource === "comp" && user.compGrantId;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Plan for ${user.email}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-inset"
          >
            Cancel
          </button>
          {isComp && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Revoke comp grant for ${user.email}?`)) return;
                startTransition(async () => {
                  const res = await revokeCompAction(user.compGrantId!);
                  if (!res.ok) onError(res.error);
                  else onDone(`Revoked comp grant for ${user.email}.`);
                });
              }}
              className="rounded-lg border border-danger/30 bg-surface px-4 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              Revoke grant
            </button>
          )}
          <button
            type="button"
            disabled={pending || isStripe || tier === "free"}
            onClick={() => {
              startTransition(async () => {
                const expISO = noExpiry
                  ? null
                  : (() => {
                      const d = new Date(expiresAt + "T23:59:59");
                      return Number.isNaN(d.getTime()) ? null : d.toISOString();
                    })();
                const res = await grantCompAction({
                  userId: user.id,
                  tier,
                  note: note.trim() || undefined,
                  expiresAt: expISO,
                });
                if (!res.ok) onError(res.error);
                else onDone(`Granted ${TIER_LABELS[tier]} to ${user.email}.`);
              });
            }}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : isComp ? "Update grant" : "Grant plan"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-surface-inset px-3 py-2 text-xs text-muted">
          Current:{" "}
          <span className="font-semibold text-foreground">{TIER_LABELS[user.tier]}</span>
          {" · "}
          <span>
            {user.entitlementSource === "stripe"
              ? "Stripe subscription"
              : user.entitlementSource === "comp"
                ? `Comp grant${user.entitlementExpiresAt ? ` (expires ${formatExpiry(user.entitlementExpiresAt)})` : " (no expiry)"}`
                : "Free tier"}
          </span>
        </div>

        {isStripe && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800">
            This user has an active Stripe subscription. Manage billing in Stripe directly; grants here will be overridden by the paid subscription.
          </p>
        )}

        <Field label="Tier">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as SubscriptionTier)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="free">Free</option>
            <option value="coach">Coach</option>
            <option value="coach_ai">Coach AI</option>
          </select>
          {tier === "free" && (
            <p className="mt-1 text-xs text-muted">
              Granting Free does nothing — use Revoke grant to remove an existing comp.
            </p>
          )}
        </Field>

        <Field label="Expires">
          <div className="mt-1 flex items-center gap-2">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={noExpiry}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={noExpiry}
                onChange={(e) => setNoExpiry(e.target.checked)}
              />
              Never expires
            </label>
          </div>
          <span className="mt-1 block text-xs text-muted">Defaults to one year from today.</span>
        </Field>

        <Field label="Note (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this grant?"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
      </div>
    </Modal>
  );
}

function AddUserDialog({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"user" | "admin" | "coach">("user");
  const [pending, startTransition] = useTransition();

  const valid = email.trim().length > 0 && password.length >= 8;

  return (
    <Modal
      open
      onClose={onClose}
      title="Add user"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-inset"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || pending}
            onClick={() => {
              startTransition(async () => {
                const res = await createUserAsAdminAction({
                  email,
                  password,
                  role,
                  displayName: displayName || undefined,
                });
                if (!res.ok) onError(res.error);
                else onDone(`Created ${email.trim()}.`);
              });
            }}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create user"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Email" required>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Password" required hint="At least 8 characters.">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Display name (optional)">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "user" | "admin" | "coach")}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="user">User</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function EditUserDialog({
  user,
  canDemoteSelf,
  onClose,
  onDone,
  onError,
}: {
  user: AdminUserRow;
  canDemoteSelf: boolean;
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [role, setRole] = useState<"user" | "admin" | "coach">(user.role);
  const [pending, startTransition] = useTransition();

  const changed =
    email.trim() !== user.email ||
    displayName.trim() !== (user.displayName ?? "") ||
    role !== user.role;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.email}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-inset"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!changed || pending}
            onClick={() => {
              startTransition(async () => {
                const res = await updateUserAsAdminAction({
                  userId: user.id,
                  email: email.trim() !== user.email ? email : undefined,
                  displayName:
                    displayName.trim() !== (user.displayName ?? "") ? displayName : undefined,
                  role: role !== user.role ? role : undefined,
                });
                if (!res.ok) onError(res.error);
                else onDone(`Updated ${email.trim()}.`);
              });
            }}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Display name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "user" | "admin" | "coach")}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="user">User</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
          {!canDemoteSelf && role === "admin" && (
            <p className="mt-1 text-xs text-muted">
              You cannot remove your own admin role.
            </p>
          )}
        </Field>
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onDone,
  onError,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password for ${user.email}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-inset"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={password.length < 8 || pending}
            onClick={() => {
              startTransition(async () => {
                const res = await setUserPasswordAsAdminAction({
                  userId: user.id,
                  password,
                });
                if (!res.ok) onError(res.error);
                else onDone(`Password updated for ${user.email}.`);
              });
            }}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : "Set password"}
          </button>
        </>
      }
    >
      <Field label="New password" hint="At least 8 characters. Share it with the user securely.">
        <input
          type="text"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </Field>
    </Modal>
  );
}

function UserStatsPanel({ userId }: { userId: string }) {
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<AdminUserActivity | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError(null);
    setActivity(null);
    setActivityError(null);
    setShowRecent(false);
    getAdminUserStatsAction(userId).then((res) => {
      if (cancelled) return;
      if (res.ok) setStats(res.stats);
      else setError(res.error);
    });
    getAdminUserActivityAction(userId).then((res) => {
      if (cancelled) return;
      if (res.ok) setActivity(res.activity);
      else setActivityError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) {
    return <p className="text-xs text-danger">Couldn&rsquo;t load stats: {error}</p>;
  }
  function formatDuration(seconds: number | undefined): string {
    if (!seconds || seconds < 60) return `${seconds ?? 0}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }
  function firstPlayAge(): string | undefined {
    if (!stats) return undefined;
    if (!stats.signupAt) return "—";
    if (!stats.firstPlayAt) return "never";
    const ms = new Date(stats.firstPlayAt).getTime() - new Date(stats.signupAt).getTime();
    if (ms < 0) return "0m";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h`;
    const days = Math.round(hrs / 24);
    return `${days}d`;
  }
  const locationStr = activity?.acquisition
    ? [
        activity.acquisition.city,
        activity.acquisition.region,
        activity.acquisition.country,
      ]
        .filter(Boolean)
        .join(", ") || null
    : null;
  const items = [
    { label: "Playbooks owned", value: stats?.playbooksOwned },
    { label: "Playbooks shared", value: stats?.playbooksShared },
    { label: "Plays created", value: stats?.playsCreated },
    { label: "People shared with", value: stats?.peopleSharedWith },
    { label: "Active days (30d)", value: stats?.activeDaysLast30 },
    { label: "First-play age", value: firstPlayAge() },
    { label: "Location", value: locationStr ?? (activity ? "—" : undefined) },
    {
      label: "Invites sent",
      value:
        stats !== null
          ? `${stats.invitesAccepted}/${stats.invitesSent}`
          : undefined,
    },
    {
      label: "Time on site",
      value: stats ? formatDuration(stats.totalSecondsOnSite) : undefined,
    },
    {
      label: "Last active",
      value: stats?.lastActiveAt
        ? new Date(stats.lastActiveAt).toLocaleDateString()
        : stats
          ? "—"
          : undefined,
    },
  ];
  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
        {items.map((it) => {
          const isLong = typeof it.value === "string" && it.value.length > 6;
          return (
            <div
              key={it.label}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {it.label}
              </p>
              <p
                className={`mt-0.5 font-bold tabular-nums text-foreground ${isLong ? "text-sm" : "text-xl"}`}
                title={typeof it.value === "string" ? it.value : undefined}
              >
                {stats || activity ? (it.value ?? "—") : "—"}
              </p>
            </div>
          );
        })}
      </div>
      {activityError && (
        <p className="text-xs text-danger">
          Couldn&rsquo;t load activity: {activityError}
        </p>
      )}
      {activity && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 md:col-span-2 xl:col-span-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Sign-up source
            </p>
            <p className="text-sm font-semibold text-foreground">
              {activity.signupSource.label}
            </p>
            {activity.signupSource.detail && (
              <p className="text-xs text-muted">
                {activity.signupSource.detail}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Acquisition
            </p>
            {activity.acquisition ? (
              <ul className="space-y-0.5 text-xs text-foreground">
                <li>
                  <span className="text-muted">First seen:</span>{" "}
                  {new Date(
                    activity.acquisition.firstSeenAt ?? "",
                  ).toLocaleString()}
                </li>
                <li>
                  <span className="text-muted">Landing:</span>{" "}
                  <span className="font-mono">
                    {activity.acquisition.landingPath ?? "—"}
                  </span>
                </li>
                <li>
                  <span className="text-muted">Source:</span>{" "}
                  <span className="font-semibold">
                    {activity.acquisition.source.label}
                  </span>
                  {activity.acquisition.source.host &&
                    activity.acquisition.source.host !==
                      activity.acquisition.source.label && (
                      <span className="ml-1 text-muted">
                        ({activity.acquisition.source.host})
                      </span>
                    )}
                </li>
                <li>
                  <span className="text-muted">Referrer:</span>{" "}
                  <span className="font-mono">
                    {activity.acquisition.referrer ?? "—"}
                  </span>
                </li>
                <li>
                  <span className="text-muted">UTM:</span>{" "}
                  {[
                    activity.acquisition.utmSource,
                    activity.acquisition.utmMedium,
                    activity.acquisition.utmCampaign,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "—"}
                </li>
                <li>
                  <span className="text-muted">Location:</span>{" "}
                  {[
                    activity.acquisition.city,
                    activity.acquisition.region,
                    activity.acquisition.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                  {activity.acquisition.locationSource === "session_ip" && (
                    <span
                      className="ml-1 text-muted"
                      title="Derived from sign-in IP — page-view geo headers were missing"
                    >
                      (from sign-in IP)
                    </span>
                  )}
                </li>
                <li>
                  <span className="text-muted">Device:</span>{" "}
                  {activity.acquisition.device ?? "—"}
                </li>
              </ul>
            ) : (
              <p className="text-xs text-muted">No page-view data yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Last 30 days
            </p>
            <ul className="space-y-0.5 text-xs text-foreground tabular-nums">
              <li>
                <span className="text-muted">Page views:</span>{" "}
                {activity.totalsLast30.pageViews}
              </li>
              <li>
                <span className="text-muted">Sessions:</span>{" "}
                {activity.totalsLast30.distinctSessions}
              </li>
              <li>
                <span className="text-muted">Avg session:</span>{" "}
                {activity.totalsLast30.avgSessionMinutes != null
                  ? `${activity.totalsLast30.avgSessionMinutes}m`
                  : "—"}
              </li>
            </ul>
          </div>

          {activity.sessions.length > 0 && (
            <div className="rounded-lg border border-border bg-surface px-3 py-2 md:col-span-2 xl:col-span-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Sign-in sessions
              </p>
              <ul className="space-y-0.5 text-xs text-foreground">
                {activity.sessions.map((s, i) => (
                  <li key={i} className="tabular-nums">
                    <span className="font-medium">
                      {s.deviceLabel ?? "Unknown device"}
                    </span>{" "}
                    <span className="text-muted">
                      · {s.approxLocation ?? "unknown loc"}
                    </span>{" "}
                    <span className="text-muted">
                      · {new Date(s.createdAt).toLocaleDateString()} → last seen{" "}
                      {new Date(s.lastSeenAt).toLocaleString()}
                    </span>
                    {s.revokedAt && (
                      <span className="ml-2 rounded bg-danger/10 px-1 text-[10px] uppercase text-danger">
                        revoked{s.revokedReason ? ` (${s.revokedReason})` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activity.topPaths.length > 0 && (
            <div className="rounded-lg border border-border bg-surface px-3 py-2 md:col-span-2 xl:col-span-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Top pages (30d)
              </p>
              <ul className="space-y-0.5 text-xs text-foreground tabular-nums">
                {activity.topPaths.map((p) => (
                  <li key={p.path}>
                    <span className="inline-block w-10 text-right text-muted">
                      {p.views}
                    </span>{" "}
                    <span className="font-mono">{p.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activity.recentViews.length > 0 && (
            <div className="rounded-lg border border-border bg-surface px-3 py-2 md:col-span-2 xl:col-span-4">
              <button
                type="button"
                onClick={() => setShowRecent((v) => !v)}
                className="mb-1 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-foreground"
              >
                <span>Recent activity ({activity.recentViews.length})</span>
                <span>{showRecent ? "Hide" : "Show"}</span>
              </button>
              {showRecent && (
                <ul className="space-y-0.5 text-xs text-foreground tabular-nums">
                  {activity.recentViews.map((v, i) => (
                    <li key={i}>
                      <span className="text-muted">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>{" "}
                      <span className="font-mono">{v.path}</span>
                      {v.device && (
                        <span className="ml-2 text-muted">· {v.device}</span>
                      )}
                      {v.country && (
                        <span className="ml-1 text-muted">· {v.country}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {stats && stats.tierHistory.length > 0 && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Tier history
          </p>
          <ul className="space-y-0.5 text-xs text-foreground">
            {stats.tierHistory.map((h, i) => {
              const start = new Date(h.startedAt).toLocaleDateString();
              const end = h.endedAt
                ? new Date(h.endedAt).toLocaleDateString()
                : "now";
              return (
                <li key={i} className="tabular-nums">
                  <span className="font-medium">{TIER_LABELS[h.tier]}</span>{" "}
                  <span className="rounded bg-surface-inset px-1 text-[10px] uppercase text-muted">
                    {h.source}
                  </span>{" "}
                  <span className="text-muted">
                    {start} → {end}
                  </span>
                  {h.note && (
                    <span className="ml-2 text-muted">· {h.note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
