"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Copy, Mail, Plus, Trash2, X } from "lucide-react";
import {
  createCoachInvitationAction,
  deleteCoachInvitationAction,
  emailCoachInvitationAction,
  listCoachInvitationsAction,
  revokeCoachInvitationAction,
  type CoachInvitationRow,
} from "@/app/actions/coach-invitations";
import { Modal } from "@/components/ui";

type Msg = { kind: "error" | "success"; text: string } | null;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(iso).toLocaleString();
}

function StatusPill({ status }: { status: CoachInvitationRow["status"] }) {
  const styles: Record<CoachInvitationRow["status"], string> = {
    active:
      "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800",
    redeemed:
      "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-800",
    revoked:
      "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-200 dark:ring-zinc-700",
    expired:
      "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function CoachInvitationsAdminClient({
  initialItems,
  initialError,
}: {
  initialItems: CoachInvitationRow[];
  initialError: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [msg, setMsg] = useState<Msg>(initialError ? { kind: "error", text: initialError } : null);
  const [addOpen, setAddOpen] = useState(false);
  const [emailFor, setEmailFor] = useState<CoachInvitationRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = { active: 0, redeemed: 0, revoked: 0, expired: 0 };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  function refresh() {
    startTransition(async () => {
      const res = await listCoachInvitationsAction();
      if (res.ok) setItems(res.items);
      else setMsg({ kind: "error", text: res.error });
    });
  }

  function signupUrlFor(code: string) {
    const origin =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    return `${origin}/login?invite=${encodeURIComponent(code)}`;
  }

  async function copyToClipboard(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setMsg({ kind: "error", text: "Could not copy to clipboard." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Coach invitations</h2>
          <p className="mt-1 text-sm text-muted">
            Mint one-time codes that turn a new signup into a free coach account. Codes are valid
            until used, revoked, or expired.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          <Plus className="size-4" />
          New invite
        </button>
      </div>

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

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span>{counts.active} active</span>
        <span>·</span>
        <span>{counts.redeemed} redeemed</span>
        <span>·</span>
        <span>{counts.revoked} revoked</span>
        <span>·</span>
        <span>{counts.expired} expired</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-inset text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Redeemed</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                  No invitations yet. Click <span className="font-medium">New invite</span> to
                  create one.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const codeKey = `code:${row.id}`;
                const urlKey = `url:${row.id}`;
                return (
                  <tr key={row.id} className="align-top hover:bg-surface-inset/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {row.code}
                        </span>
                      </div>
                      {row.note && (
                        <p className="mt-1 text-xs text-muted line-clamp-2">{row.note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {row.recipientEmail ?? <span className="text-muted-light">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(row.expiresAt)}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {row.redeemedAt ? (
                        <>
                          <div>{formatDate(row.redeemedAt)}</div>
                          {row.redeemedByEmail && (
                            <div className="text-muted-light">{row.redeemedByEmail}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(row.code, codeKey)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-inset"
                          title="Copy code"
                        >
                          {copied === codeKey ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          Code
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(signupUrlFor(row.code), urlKey)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-inset"
                          title="Copy signup link"
                        >
                          {copied === urlKey ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          Link
                        </button>
                        <button
                          type="button"
                          disabled={row.status !== "active"}
                          onClick={() => setEmailFor(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-inset disabled:opacity-40"
                          title="Email invite"
                        >
                          <Mail className="size-3.5" />
                          Email
                        </button>
                        {row.status === "active" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (!globalThis.confirm(`Revoke ${row.code}? It can no longer be redeemed.`)) return;
                              setMsg(null);
                              startTransition(async () => {
                                const res = await revokeCoachInvitationAction(row.id);
                                if (!res.ok) setMsg({ kind: "error", text: res.error });
                                else {
                                  setMsg({ kind: "success", text: "Invite revoked." });
                                  refresh();
                                }
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-surface px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                            title="Revoke"
                          >
                            <X className="size-3.5" />
                            Revoke
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!globalThis.confirm(`Delete invite ${row.code}? This cannot be undone.`)) return;
                            setMsg(null);
                            startTransition(async () => {
                              const res = await deleteCoachInvitationAction(row.id);
                              if (!res.ok) setMsg({ kind: "error", text: res.error });
                              else {
                                setMsg({ kind: "success", text: "Invite deleted." });
                                refresh();
                              }
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-surface px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <CreateInviteDialog
          onClose={() => setAddOpen(false)}
          onDone={(note) => {
            setAddOpen(false);
            setMsg({ kind: "success", text: note });
            refresh();
          }}
          onError={(e) => setMsg({ kind: "error", text: e })}
        />
      )}

      {emailFor && (
        <EmailInviteDialog
          invite={emailFor}
          onClose={() => setEmailFor(null)}
          onDone={(note) => {
            setEmailFor(null);
            setMsg({ kind: "success", text: note });
            refresh();
          }}
          onError={(e) => setMsg({ kind: "error", text: e })}
        />
      )}
    </div>
  );
}

function CreateInviteDialog({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (msg: string) => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState<"never" | "7" | "30" | "90">("90");
  const [sendNow, setSendNow] = useState(false);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ code: string; url: string } | null>(null);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  function expiresIso(): string | null {
    if (expires === "never") return null;
    const days = Number(expires);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  function submit() {
    if (sendNow && !recipientEmail.trim()) {
      onError("Add a recipient email to send the invite.");
      return;
    }
    startTransition(async () => {
      const res = await createCoachInvitationAction({
        recipientEmail: recipientEmail || undefined,
        note: note || undefined,
        expiresAt: expiresIso(),
      });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/login?invite=${encodeURIComponent(res.code)}`;
      if (sendNow && recipientEmail.trim()) {
        const emailRes = await emailCoachInvitationAction({ id: res.id, origin });
        if (!emailRes.ok) {
          onError(`Invite created (${res.code}) but email failed: ${emailRes.error}`);
          setCreated({ code: res.code, url });
          return;
        }
        onDone(`Invite ${res.code} emailed to ${recipientEmail.trim()}.`);
      }
      setCreated({ code: res.code, url });
    });
  }

  async function copy(value: string, key: "code" | "url") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      onError("Could not copy to clipboard.");
    }
  }

  function finish() {
    if (created) onDone(`Invite ${created.code} created.`);
    else onClose();
  }

  return (
    <Modal
      open
      onClose={finish}
      title={created ? "Invite ready to share" : "Create coach invite"}
      footer={
        created ? (
          <button
            type="button"
            onClick={finish}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Done
          </button>
        ) : (
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
              disabled={pending}
              onClick={submit}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? "Creating…" : sendNow ? "Create & email" : "Create invite"}
            </button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Share this link so the coach lands on signup with the code
            pre-filled. You can also copy just the code if they&apos;d rather
            type it.
          </p>
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Shareable link
            </span>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={created.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-inset px-3 py-2 font-mono text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => copy(created.url, "url")}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-inset"
              >
                {copied === "url" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied === "url" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Code</span>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={created.code}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-inset px-3 py-2 font-mono text-sm font-semibold text-foreground"
              />
              <button
                type="button"
                onClick={() => copy(created.code, "code")}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-inset"
              >
                {copied === "code" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Recipient email (optional)</span>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="coach@example.com"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="mt-1 block text-xs text-muted">
              Used when you email the invite. You can leave blank and copy the code by hand.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. HS varsity coach, referred by Jane"
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Expires</span>
            <select
              value={expires}
              onChange={(e) => setExpires(e.target.value as typeof expires)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="90">In 90 days</option>
              <option value="30">In 30 days</option>
              <option value="7">In 7 days</option>
              <option value="never">Never</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="size-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-foreground">
              Email this invite now{" "}
              <span className="text-xs text-muted">(requires Resend configured)</span>
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}

function EmailInviteDialog({
  invite,
  onClose,
  onDone,
  onError,
}: {
  invite: CoachInvitationRow;
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (msg: string) => void;
}) {
  const [recipient, setRecipient] = useState(invite.recipientEmail ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!recipient.trim()) {
      onError("Recipient email is required.");
      return;
    }
    startTransition(async () => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await emailCoachInvitationAction({
        id: invite.id,
        overrideRecipient: recipient,
        origin,
      });
      if (!res.ok) onError(res.error);
      else onDone(`Invite emailed to ${recipient.trim()}.`);
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Email invite ${invite.code}`}
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
            disabled={pending || !recipient.trim()}
            onClick={submit}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send email"}
          </button>
        </>
      }
    >
      <label className="block text-sm">
        <span className="font-medium text-foreground">Recipient email</span>
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="coach@example.com"
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="mt-1 block text-xs text-muted">
          Uses the Resend key configured in Integrations.
        </span>
      </label>
    </Modal>
  );
}
