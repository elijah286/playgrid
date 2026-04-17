"use client";

import { useState, useTransition } from "react";
import {
  createUserAsAdminAction,
  deleteUserAsAdminAction,
  listUsersForAdminAction,
  updateUserRoleAction,
} from "@/app/actions/admin-users";

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  createdAt: string;
  lastSignIn: string | null;
};

export function UsersAdminClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUserRow[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  function refresh() {
    startTransition(async () => {
      const res = await listUsersForAdminAction();
      if (res.ok) setUsers(res.users);
      else setMsg(res.error);
    });
  }

  return (
    <div className="space-y-8">
      {msg && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          {msg}
        </p>
      )}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-pg-line/80">
        <h2 className="text-sm font-semibold text-pg-ink">Add user</h2>
        <p className="mt-1 text-xs text-pg-subtle">
          Creates an Auth user and profile. They can sign in with email and password.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-pg-muted">Email</span>
            <input
              className="mt-1 w-full rounded-lg border border-pg-line px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="off"
            />
          </label>
          <label className="text-sm">
            <span className="text-pg-muted">Password</span>
            <input
              className="mt-1 w-full rounded-lg border border-pg-line px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label className="text-sm">
            <span className="text-pg-muted">Role</span>
            <select
              className="mt-1 w-full rounded-lg border border-pg-line px-3 py-2"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={pending || !email.trim() || password.length < 8}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const res = await createUserAsAdminAction({
                email,
                password,
                role: newRole,
              });
              if (!res.ok) setMsg(res.error);
              else {
                setEmail("");
                setPassword("");
                refresh();
              }
            });
          }}
          className="mt-4 rounded-lg bg-pg-turf px-4 py-2 text-sm font-medium text-white hover:bg-pg-turf-deep disabled:opacity-50"
        >
          Create user
        </button>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-pg-ink">Users</h2>
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-pg-line/80">
          <table className="w-full text-left text-sm">
            <thead className="bg-pg-mist text-xs uppercase text-pg-subtle">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pg-mist bg-white">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-pg-ink">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-pg-line px-2 py-1 text-xs"
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => {
                        const role = e.target.value as "user" | "admin";
                        startTransition(async () => {
                          setMsg(null);
                          const res = await updateUserRoleAction(u.id, role);
                          if (!res.ok) setMsg(res.error);
                          else refresh();
                        });
                      }}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending || u.id === currentUserId}
                      onClick={() => {
                        if (!confirm(`Delete ${u.email}?`)) return;
                        startTransition(async () => {
                          setMsg(null);
                          const res = await deleteUserAsAdminAction(u.id);
                          if (!res.ok) setMsg(res.error);
                          else refresh();
                        });
                      }}
                      className="text-xs text-red-700 hover:underline disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
