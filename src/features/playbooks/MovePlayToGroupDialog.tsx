"use client";

import { useState } from "react";
import { Check, FolderInput, Inbox } from "lucide-react";
import { Modal } from "@/components/ui";
import { setPlayGroupAction } from "@/app/actions/plays";

export type MovePlayToGroupTarget = {
  playId: string;
  playName: string;
  currentGroupId: string | null;
};

/**
 * Picker dialog used by the play card menu (playbook detail) and the play
 * editor's overflow menu to move a play between groups. Same component on
 * both surfaces so the affordance reads identically. The caller passes the
 * full group list it already has in state — no extra fetch.
 *
 * On confirmation, calls setPlayGroupAction and invokes onMoved with the
 * resolved group id (or null for ungrouped) so the parent can refresh its
 * own state without a roundtrip.
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

  async function pick(groupId: string | null) {
    if (!target) return;
    if (groupId === target.currentGroupId) {
      onClose();
      return;
    }
    setPendingId(groupId ?? "__none__");
    const res = await setPlayGroupAction(target.playId, groupId);
    setPendingId(null);
    if (!res.ok) {
      onError?.(res.error);
      return;
    }
    onMoved(groupId);
    onClose();
  }

  const empty = groups.length === 0;

  return (
    <Modal open onClose={onClose} title={`Move "${target.playName}" to group`}>
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
              hint="Remove this play from any group"
              selected={target.currentGroupId === null}
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
                selected={target.currentGroupId === g.id}
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
