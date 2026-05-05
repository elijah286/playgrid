"use client";

import { useState } from "react";
import { Check, FolderInput, Inbox } from "lucide-react";
import { Modal } from "@/components/ui";
import { setPlayGroupAction } from "@/app/actions/plays";

export type MovePlayToGroupTarget =
  | {
      kind?: "single";
      playId: string;
      playName: string;
      currentGroupId: string | null;
    }
  | {
      kind: "bulk";
      playIds: string[];
    };

/**
 * Picker dialog used by the play card menu (playbook detail), the play
 * editor's overflow menu, and the playbook bulk-selection toolbar to move
 * plays between groups. Same component on every surface so the affordance
 * reads identically. The caller passes the full group list it already has
 * in state — no extra fetch.
 *
 * On confirmation, runs setPlayGroupAction (looped for the bulk variant)
 * and invokes onMoved with the resolved group id (or null for ungrouped)
 * so the parent can refresh its own state without a roundtrip.
 */
export function MovePlayToGroupDialog({
  target,
  groups,
  onClose,
  onMoved,
  onError,
}: {
  target: MovePlayToGroupTarget | null;
  groups: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onMoved: (groupId: string | null) => void;
  onError?: (message: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | "__none__" | null>(null);

  if (!target) return null;

  const isBulk = target.kind === "bulk";
  const playIds = isBulk ? target.playIds : [target.playId];
  const currentGroupId = isBulk ? null : target.currentGroupId;
  const title = isBulk
    ? `Move ${playIds.length} ${playIds.length === 1 ? "play" : "plays"} to group`
    : `Move "${target.playName}" to group`;
  const ungroupedHint = isBulk
    ? "Remove the selected plays from any group"
    : "Remove this play from any group";

  async function pick(groupId: string | null) {
    if (!target) return;
    if (!isBulk && groupId === currentGroupId) {
      onClose();
      return;
    }
    setPendingId(groupId ?? "__none__");
    for (const id of playIds) {
      const res = await setPlayGroupAction(id, groupId);
      if (!res.ok) {
        setPendingId(null);
        onError?.(res.error);
        return;
      }
    }
    setPendingId(null);
    onMoved(groupId);
    onClose();
  }

  const empty = groups.length === 0;

  return (
    <Modal open onClose={onClose} title={title}>
      {empty ? (
        <p className="text-sm text-muted">
          This playbook doesn&rsquo;t have any groups yet. Create one from the
          filter menu (or ask Coach Cal) and come back.
        </p>
      ) : (
        <ul className="-mx-2 max-h-[60vh] overflow-y-auto">
          <li>
            <GroupRow
              icon={Inbox}
              label="Ungrouped"
              hint={ungroupedHint}
              selected={!isBulk && currentGroupId === null}
              pending={pendingId === "__none__"}
              onSelect={() => void pick(null)}
            />
          </li>
          <li className="my-1 border-t border-border" aria-hidden />
          {groups.map((g) => (
            <li key={g.id}>
              <GroupRow
                icon={FolderInput}
                label={g.name}
                selected={!isBulk && currentGroupId === g.id}
                pending={pendingId === g.id}
                onSelect={() => void pick(g.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function GroupRow({
  icon: Icon,
  label,
  hint,
  selected,
  pending,
  onSelect,
}: {
  icon: typeof FolderInput;
  label: string;
  hint?: string;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-inset disabled:opacity-60"
    >
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {label}
        </span>
        {hint && (
          <span className="block truncate text-[11px] text-muted">{hint}</span>
        )}
      </span>
      {selected && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <Check className="size-3" />
          Current
        </span>
      )}
    </button>
  );
}
