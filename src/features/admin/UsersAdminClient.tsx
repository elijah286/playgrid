"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import {
  createUserAsAdminAction,
  deleteUserAsAdminAction,
  listUsersForAdminAction,
  setUserPasswordAsAdminAction,
  updateUserAsAdminAction,
} from "@/app/actions/admin-users";
import { Modal } from "@/components/ui";

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  createdAt: string;
  lastSignIn: string | null;
};

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; user: AdminUserRow }
  | { kind: "reset"; user: AdminUserRow }
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      return (
        u.email.toLowerCase().includes(q) ||
        (u.displayName ?? "").toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [users, query]);

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
              placeholder="Search name, email, role…"
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
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  No users match that search.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-surface-inset/40">
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
                  <td className="px-4 py-3 align-middle text-muted">{u.role}</td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setDialog({ kind: "edit", user: u })}
                        className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-inset disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setDialog({ kind: "reset", user: u })}
                        className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-inset disabled:opacity-50"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        disabled={pending || u.id === currentUserId}
                        onClick={() => {
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
                        className="rounded-lg border border-danger/30 bg-surface px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
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
    </div>
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
  const [role, setRole] = useState<"user" | "admin">("user");
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
            onChange={(e) => setRole(e.target.value as "user" | "admin")}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="user">User</option>
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
  const [role, setRole] = useState<"user" | "admin">(user.role);
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
            onChange={(e) => setRole(e.target.value as "user" | "admin")}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="user">User</option>
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
