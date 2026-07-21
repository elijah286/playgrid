"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { InviteTeamMemberDialog } from "@/app/(dashboard)/playbooks/[playbookId]/PlaybookHeader";
import { bucketRoster } from "@/app/(dashboard)/playbooks/[playbookId]/roster-buckets";
import type { PlaybookRosterMember } from "@/app/actions/playbook-roster";
import {
  addRosterEntryAction,
  approveCoachUpgradeAction,
  approveMemberAction,
  bulkAddRosterEntriesAction,
  deleteRosterEntryAction,
  denyCoachUpgradeAction,
  denyMemberAction,
  removeMemberAndBanAction,
  removeStaffMemberAction,
  setCoachTitleAction,
  setHeadCoachAction,
  setMemberRoleAction,
  unlinkRosterEntryAction,
  updateRosterEntryAction,
} from "@/app/actions/playbook-roster";

const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K"] as const;

type Result = { ok: true } | { ok: false; error: string };

// Confirm copy is matched VERBATIM to the production roster panel
// (ui.tsx) — the remove-&-ban disclosure is App Store UGC 1.2 relevant.
const CONFIRM = {
  demote: (n: string) =>
    `Demote ${n} to player? They'll keep view access but lose the ability to edit plays, invite others, or change the roster.`,
  promote: (n: string) =>
    `Make ${n} a coach? They'll be able to edit and delete plays, invite others, and manage your roster. You can demote them back anytime.`,
  deleteEntry: (n: string) => `Remove ${n} from the roster?`,
  unlink: (n: string) =>
    `Unlink ${n} from this roster spot? They keep playbook access; the spot returns to unclaimed.`,
  removeStaff: (n: string) =>
    `Remove ${n} from the staff? They'll lose access to this playbook.`,
  removeFromTeam: (n: string) =>
    `Remove ${n} from the team? They'll lose access to this playbook.`,
  ban: (n: string) =>
    `Remove and ban ${n}? They'll lose access and won't be able to rejoin this playbook through an invite link.`,
};

export function RosterClient({
  playbookId,
  teamName,
  senderName,
  canManage,
  isOwner,
  viewerUserId,
  members,
}: {
  playbookId: string;
  teamName: string;
  senderName: string | null;
  canManage: boolean;
  isOwner: boolean;
  viewerUserId: string;
  members: PlaybookRosterMember[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PlaybookRosterMember | null>(null);
  const [titleFor, setTitleFor] = useState<PlaybookRosterMember | null>(null);

  const { activeCoaches, rosterRows, pending, coachUpgradeRequests } =
    bucketRoster(members);

  // Every mutation follows the same shape: mark the row pending, call the
  // action, surface the error via toast (never silent — a rejected server
  // action can THROW, not just return {ok:false}), then refresh so the shell
  // re-renders from the source of truth. Roster actions revalidate the
  // /playbooks path, so router.refresh() re-pulls the list.
  async function run(id: string, fn: () => Promise<Result>, okMsg?: string) {
    setPendingId(id);
    try {
      const res = await fn();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      if (okMsg) toast(okMsg, "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setPendingId(null);
    }
  }

  const nameOf = (m: PlaybookRosterMember) =>
    m.label || m.display_name || "this person";

  const approvalCount = pending.length + coachUpgradeRequests.length;

  function coachMenu(m: PlaybookRosterMember & { user_id: string }): ActionMenuItem[] {
    const name = nameOf(m);
    return [
      {
        label: m.is_head_coach ? "Unset head coach" : "Make head coach",
        icon: Crown,
        onSelect: () =>
          run(m.id, () =>
            setHeadCoachAction(playbookId, m.is_head_coach ? null : m.user_id),
          ),
      },
      {
        label: "Set coach title…",
        icon: Pencil,
        onSelect: () => setTitleFor(m),
      },
      {
        label: "Demote to player",
        icon: UserMinus,
        onSelect: () => {
          if (!window.confirm(CONFIRM.demote(name))) return;
          run(m.id, () =>
            setMemberRoleAction({ playbookId, memberId: m.id, role: "viewer" }),
          );
        },
      },
      {
        label: "Remove from staff",
        icon: UserMinus,
        onSelect: () => {
          if (!window.confirm(CONFIRM.removeStaff(name))) return;
          run(m.id, () => removeStaffMemberAction(playbookId, m.user_id));
        },
      },
      {
        label: "Remove & ban",
        icon: Ban,
        danger: true,
        onSelect: () => {
          if (!window.confirm(CONFIRM.ban(name))) return;
          run(
            m.id,
            () => removeMemberAndBanAction(playbookId, m.user_id),
            `${name} removed and banned.`,
          );
        },
      },
    ];
  }

  function playerMenu(m: PlaybookRosterMember): ActionMenuItem[] {
    const name = nameOf(m);
    const unclaimed = m.user_id === null && m.managed_by === null;
    const isMe = m.user_id !== null && m.user_id === viewerUserId;
    const uid = m.user_id; // narrowed by the `uid` guards below
    const items: ActionMenuItem[] = [
      { label: "Edit player", icon: Pencil, onSelect: () => setEditing(m) },
    ];

    // Role changes are owner-only and only apply to claimed rows.
    if (isOwner && !unclaimed && uid && m.role === "editor") {
      items.push({
        label: "Demote to player",
        icon: UserMinus,
        onSelect: () => {
          if (!window.confirm(CONFIRM.demote(name))) return;
          run(m.id, () =>
            setMemberRoleAction({ playbookId, memberId: m.id, role: "viewer" }),
          );
        },
      });
    } else if (isOwner && !unclaimed && uid && m.role === "viewer") {
      items.push({
        label: "Make a coach",
        icon: Crown,
        onSelect: () => {
          if (!window.confirm(CONFIRM.promote(name))) return;
          run(m.id, () =>
            setMemberRoleAction({ playbookId, memberId: m.id, role: "editor" }),
          );
        },
      });
    }

    // Removal — mirrors production exactly:
    //  • unclaimed slot (no user, no manager) → hard-delete the spot.
    //  • claimed NAMED slot (has a label) → non-destructive Unlink (keeps
    //    the person's access; the spot returns to unclaimed).
    //  • joined viewer (no label) → Remove from team (discloses access loss).
    //  • never delete/kick the owner or yourself.
    if (unclaimed) {
      items.push({
        label: "Remove from roster",
        icon: Trash2,
        danger: true,
        onSelect: () => {
          if (!window.confirm(CONFIRM.deleteEntry(name))) return;
          run(m.id, () => deleteRosterEntryAction(playbookId, m.id));
        },
      });
    } else {
      if (m.label !== null) {
        items.push({
          label: "Unlink user",
          icon: X,
          onSelect: () => {
            if (!window.confirm(CONFIRM.unlink(name))) return;
            run(m.id, () => unlinkRosterEntryAction(playbookId, m.id));
          },
        });
      } else if (m.role !== "owner" && uid && !isMe) {
        items.push({
          label: "Remove from team",
          icon: UserMinus,
          onSelect: () => {
            if (!window.confirm(CONFIRM.removeFromTeam(name))) return;
            run(m.id, () => removeStaffMemberAction(playbookId, uid));
          },
        });
      }
      if (m.role !== "owner" && uid && !isMe) {
        items.push({
          label: "Remove & ban",
          icon: Ban,
          danger: true,
          onSelect: () => {
            if (!window.confirm(CONFIRM.ban(name))) return;
            run(
              m.id,
              () => removeMemberAndBanAction(playbookId, uid),
              `${name} removed and banned.`,
            );
          },
        });
      }
    }
    return items;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:bg-surface-inset"
          >
            <Plus className="size-4" aria-hidden />
            Add player
          </button>
          <button
            type="button"
            onClick={() => setInvite(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
          >
            <UserPlus className="size-4" aria-hidden />
            Invite
          </button>
        </div>
      )}

      {/* Needs approval — joiners + coach-access requests. */}
      {canManage && approvalCount > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-warning">
            Needs approval · {approvalCount}
          </h2>
          <ul className="overflow-hidden rounded-xl border border-warning/40 bg-warning-light/40">
            {pending.map((m) => (
              <ApprovalRow
                key={m.id}
                name={nameOf(m)}
                sub="Wants to join"
                busy={pendingId === m.id}
                onApprove={() =>
                  run(m.id, () => approveMemberAction(playbookId, m.user_id), `${nameOf(m)} approved.`)
                }
                onDeny={() => run(m.id, () => denyMemberAction(playbookId, m.user_id))}
              />
            ))}
            {coachUpgradeRequests.map((m) => (
              <ApprovalRow
                key={m.id}
                name={nameOf(m)}
                sub="Requested coach access"
                busy={pendingId === m.id}
                onApprove={() =>
                  run(m.id, () => approveCoachUpgradeAction(playbookId, m.user_id), `${nameOf(m)} is now a coach.`)
                }
                onDeny={() => run(m.id, () => denyCoachUpgradeAction(playbookId, m.user_id))}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Coaches */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <Shield className="size-3.5" aria-hidden />
          Coaches · {activeCoaches.length}
        </h2>
        {activeCoaches.length === 0 ? (
          <EmptyRow>No coaches yet.</EmptyRow>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            {activeCoaches.map((m) => {
              const self = m.user_id === viewerUserId;
              const owner = m.role === "owner";
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                >
                  <Avatar>{initial(nameOf(m))}</Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {m.display_name || m.label || "Coach"}
                      </span>
                      {m.is_head_coach && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          <Crown className="size-3" aria-hidden />
                          Head
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {owner ? "Owner" : m.coach_title || "Coach"}
                    </span>
                  </span>
                  {pendingId === m.id ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
                  ) : isOwner && !owner && !self ? (
                    <ActionMenu items={coachMenu(m)} />
                  ) : (
                    <RoleTag>{owner ? "Owner" : self ? "You" : "Coach"}</RoleTag>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Players */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <Users className="size-3.5" aria-hidden />
          Players · {rosterRows.length}
        </h2>
        {rosterRows.length === 0 ? (
          <EmptyRow>
            No players yet.{canManage ? " Add or invite players above." : ""}
          </EmptyRow>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            {rosterRows.map((m) => {
              const posLabel =
                m.positions.length > 0 ? m.positions.join(" · ") : m.position;
              const tentative = m.status === "pending";
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                >
                  <Avatar>
                    {m.jersey_number ? m.jersey_number : initial(nameOf(m))}
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {m.label || m.display_name || "Unclaimed spot"}
                      </span>
                      {m.is_minor && (
                        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                          Minor
                        </span>
                      )}
                      {tentative && (
                        <span className="rounded-full bg-muted-light/50 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                          Pending
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {[posLabel, m.jersey_number ? `#${m.jersey_number}` : null]
                        .filter(Boolean)
                        .join(" · ") ||
                        (m.manager_display_name
                          ? `Managed by ${m.manager_display_name}`
                          : "Player")}
                    </span>
                  </span>
                  {pendingId === m.id ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
                  ) : canManage ? (
                    <ActionMenu items={playerMenu(m)} />
                  ) : (
                    posLabel && <RoleTag>{posLabel}</RoleTag>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {invite && (
        <InviteTeamMemberDialog
          playbookId={playbookId}
          teamName={teamName}
          senderName={senderName}
          canManage={canManage}
          onClose={() => setInvite(false)}
        />
      )}
      {addOpen && (
        <AddPlayerSheet
          playbookId={playbookId}
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <EditPlayerSheet
          playbookId={playbookId}
          member={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {titleFor && titleFor.user_id && (
        <CoachTitleSheet
          initial={titleFor.coach_title}
          name={nameOf(titleFor)}
          onClose={() => setTitleFor(null)}
          onSave={(title) => {
            const uid = titleFor.user_id as string;
            const id = titleFor.id;
            setTitleFor(null);
            run(id, () => setCoachTitleAction(playbookId, uid, title));
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-inset text-xs font-bold text-muted">
      {children}
    </span>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-xs text-muted">
      {children}
    </p>
  );
}

function RoleTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-bold text-muted">
      {children}
    </span>
  );
}

function ApprovalRow({
  name,
  sub,
  busy,
  onApprove,
  onDeny,
}: {
  name: string;
  sub: string;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-warning/30 px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      {busy ? (
        <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
      ) : (
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onDeny}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-bold text-muted transition-colors hover:text-foreground"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex min-h-[36px] items-center rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-hover"
          >
            Approve
          </button>
        </span>
      )}
    </li>
  );
}

/* -------------------------------------------------------------- overlays */

/** Clamp a sheet to the *visual* viewport so its footer/buttons stay above
 *  the on-screen keyboard on mobile (iOS shrinks visualViewport, not vh). */
function useVisualViewportHeight(): number | null {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setH(vv.height);
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return h;
}

function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const vh = useVisualViewportHeight();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col rounded-t-2xl bg-surface-raised shadow-2xl ring-1 ring-border sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: vh ? `${Math.round(vh * 0.94)}px` : "92dvh" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div
          className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

function PositionPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {POSITIONS.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
            className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition-colors ${
              on
                ? "bg-primary text-white ring-primary"
                : "bg-surface text-muted ring-border hover:bg-surface-inset hover:text-foreground"
            }`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"
    >
      Cancel
    </button>
  );
}

function SubmitButton({
  onClick,
  pending,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function AddPlayerSheet({
  playbookId,
  onClose,
  onDone,
}: {
  playbookId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"one" | "bulk">("one");
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [positions, setPositions] = useState<string[]>([]);
  const [isMinor, setIsMinor] = useState(false);
  const [bulk, setBulk] = useState("");
  const [pending, start] = useTransition();

  const submitOne = () => {
    if (!name.trim()) {
      toast("Name is required.", "error");
      return;
    }
    start(async () => {
      try {
        const res = await addRosterEntryAction({
          playbookId,
          label: name.trim(),
          jerseyNumber: jersey.trim() || null,
          positions,
          isMinor,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast("Player added.", "success");
        onDone();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't add player.", "error");
      }
    });
  };

  const submitBulk = () => {
    const labels = bulk
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (labels.length === 0) {
      toast("Enter at least one name.", "error");
      return;
    }
    start(async () => {
      try {
        const res = await bulkAddRosterEntriesAction({ playbookId, labels });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast(`Added ${res.added} ${res.added === 1 ? "player" : "players"}.`, "success");
        onDone();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't add players.", "error");
      }
    });
  };

  const submit = tab === "one" ? submitOne : submitBulk;

  return (
    <Sheet
      title="Add player"
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={submit} pending={pending}>
            {tab === "one" ? "Add player" : "Add players"}
          </SubmitButton>
        </>
      }
    >
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-inset p-1">
        {(["one", "bulk"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
              tab === t ? "bg-surface-raised text-foreground shadow-sm" : "text-muted"
            }`}
          >
            {t === "one" ? "One player" : "Quick add many"}
          </button>
        ))}
      </div>

      {tab === "one" ? (
        <div className="space-y-4">
          <Field label="Name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitOne()}
              placeholder="Player name"
              autoFocus
            />
          </Field>
          <Field label="Jersey (optional)">
            <input
              className={inputCls}
              value={jersey}
              onChange={(e) => setJersey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitOne()}
              placeholder="e.g. 12"
              inputMode="numeric"
            />
          </Field>
          <Field label="Positions (optional)">
            <PositionPicker value={positions} onChange={setPositions} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isMinor}
              onChange={(e) => setIsMinor(e.target.checked)}
              className="size-4 rounded border-border"
            />
            This player is a minor
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <Field label="One name per line">
            <textarea
              className={`${inputCls} min-h-[140px] resize-y`}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={"Alex Johnson\nJordan Lee\nSam Rivera"}
              autoFocus
            />
          </Field>
          <p className="text-xs text-muted">Adds up to 30 unclaimed spots at once.</p>
        </div>
      )}
    </Sheet>
  );
}

function EditPlayerSheet({
  playbookId,
  member,
  onClose,
  onDone,
}: {
  playbookId: string;
  member: PlaybookRosterMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(member.label ?? "");
  const [jersey, setJersey] = useState(member.jersey_number ?? "");
  const [positions, setPositions] = useState<string[]>(member.positions ?? []);
  const [isMinor, setIsMinor] = useState(member.is_minor);
  const [pending, start] = useTransition();
  // A joined player without a coach-assigned label owns their own name; the
  // coach edits jersey/positions/minor but not the display name.
  const nameEditable = member.label !== null || member.user_id === null;

  const submit = () => {
    start(async () => {
      try {
        const res = await updateRosterEntryAction({
          playbookId,
          memberId: member.id,
          ...(nameEditable ? { label: name.trim() || null } : {}),
          jerseyNumber: jersey.trim() || null,
          positions,
          isMinor,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast("Saved.", "success");
        onDone();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't save.", "error");
      }
    });
  };

  return (
    <Sheet
      title="Edit player"
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={submit} pending={pending}>
            Save
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        {nameEditable && (
          <Field label="Name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
          </Field>
        )}
        <Field label="Jersey">
          <input
            className={inputCls}
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. 12"
            inputMode="numeric"
          />
        </Field>
        <Field label="Positions">
          <PositionPicker value={positions} onChange={setPositions} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isMinor}
            onChange={(e) => setIsMinor(e.target.checked)}
            className="size-4 rounded border-border"
          />
          This player is a minor
        </label>
      </div>
    </Sheet>
  );
}

function CoachTitleSheet({
  initial,
  name,
  onClose,
  onSave,
}: {
  initial: string | null;
  name: string;
  onClose: () => void;
  onSave: (title: string | null) => void;
}) {
  const [title, setTitle] = useState(initial ?? "");
  const save = () => onSave(title.trim() || null);
  return (
    <Sheet
      title={`Coach title — ${name}`}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={save} pending={false}>
            Save
          </SubmitButton>
        </>
      }
    >
      <Field label="Title">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="e.g. Offensive Coordinator"
          autoFocus
        />
      </Field>
    </Sheet>
  );
}

function initial(s: string): string {
  return s.trim().charAt(0).toUpperCase() || "?";
}
