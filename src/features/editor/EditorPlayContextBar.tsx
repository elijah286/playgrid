"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, FolderPlus, PencilLine, Tags, X } from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import {
  createPlaybookGroupAction,
  listPlaybookPlaysForNavigationAction,
  setPlayGroupAction,
} from "@/app/actions/plays";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { formatPlayFullLabel } from "@/domain/print/playbookPrint";
import { Badge, Button, IconButton, Input } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui";
import { PlaybookPlaySearchMenu } from "./PlaybookPlaySearchMenu";

type Props = {
  playId: string;
  playbookId: string;
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  initialNav: PlaybookPlayNavItem[];
  initialGroups: PlaybookGroupRow[];
  onDuplicate: () => void;
};

export function EditorPlayContextBar({
  playId,
  playbookId,
  doc,
  dispatch,
  initialNav,
  initialGroups,
  onDuplicate,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [nav, setNav] = useState(initialNav);
  const [groups, setGroups] = useState(initialGroups);
  const [renameOpen, setRenameOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [busy, startTransition] = useTransition();

  const tags = doc.metadata.tags;

  function addTag(raw: string) {
    const cleaned = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (cleaned.length === 0) return;
    const next = Array.from(new Set([...tags, ...cleaned]));
    dispatch({ type: "document.setMetadata", patch: { tags: next } });
    setTagDraft("");
  }

  function removeTag(t: string) {
    dispatch({
      type: "document.setMetadata",
      patch: { tags: tags.filter((x) => x !== t) },
    });
  }

  useEffect(() => {
    setNav(initialNav);
    setGroups(initialGroups);
  }, [initialNav, initialGroups]);

  const refreshNav = () => {
    startTransition(async () => {
      const res = await listPlaybookPlaysForNavigationAction(playbookId);
      if (res.ok) {
        setNav(res.plays);
        setGroups(res.groups);
      }
    });
  };

  const ix = useMemo(() => nav.findIndex((p) => p.id === playId), [nav, playId]);
  const prevPlay = ix > 0 ? nav[ix - 1] : null;
  const nextPlay = ix >= 0 && ix < nav.length - 1 ? nav[ix + 1] : null;

  const currentRow = nav.find((p) => p.id === playId);
  const currentGroupId = currentRow?.group_id ?? "";

  function handleCreateGroup() {
    const name = groupNameDraft.trim();
    if (!name) {
      toast("Enter a group name", "error");
      return;
    }
    startTransition(async () => {
      const res = await createPlaybookGroupAction(playbookId, name);
      if (!res.ok) toast(res.error, "error");
      else {
        toast("Group created", "success");
        setGroupNameDraft("");
        refreshNav();
      }
    });
  }

  function handleAssignGroup(groupId: string | null) {
    startTransition(async () => {
      const res = await setPlayGroupAction(playId, groupId);
      if (!res.ok) toast(res.error, "error");
      else {
        toast("Updated group", "success");
        refreshNav();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate text-xs text-muted"
          title={formatPlayFullLabel(doc)}
        >
          {formatPlayFullLabel(doc)}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Tooltip content="Previous play">
            <IconButton
              icon={ChevronLeft}
              variant="ghost"
              aria-label="Previous play"
              disabled={!prevPlay}
              onClick={() => prevPlay && router.push(`/plays/${prevPlay.id}/edit`)}
            />
          </Tooltip>
          <Tooltip content="Next play">
            <IconButton
              icon={ChevronRight}
              variant="ghost"
              aria-label="Next play"
              disabled={!nextPlay}
              onClick={() => nextPlay && router.push(`/plays/${nextPlay.id}/edit`)}
            />
          </Tooltip>

          <Tooltip content="Duplicate into new play">
            <IconButton icon={Copy} variant="ghost" onClick={onDuplicate} disabled={busy} />
          </Tooltip>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={PencilLine}
            onClick={() => setRenameOpen((v) => !v)}
          >
            Rename
          </Button>

          <PlaybookPlaySearchMenu plays={nav} groups={groups} currentPlayId={playId} />
        </div>
      </div>

      {renameOpen && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <label className="min-w-[200px] flex-1">
            <span className="text-xs text-muted">Coach name</span>
            <Input
              className="mt-1"
              value={doc.metadata.coachName}
              onChange={(e) =>
                dispatch({ type: "document.setMetadata", patch: { coachName: e.target.value } })
              }
            />
          </label>
          <label className="w-32">
            <span className="text-xs text-muted">Wristband code</span>
            <Input
              className="mt-1"
              value={doc.metadata.wristbandCode}
              onChange={(e) =>
                dispatch({ type: "document.setMetadata", patch: { wristbandCode: e.target.value } })
              }
            />
          </label>
          <Button type="button" size="sm" variant="primary" onClick={() => setRenameOpen(false)}>
            Done
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Tags className="size-3.5" />
          Tags
        </span>
        {tags.map((t) => (
          <Badge key={t} variant="default" className="inline-flex items-center gap-1">
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="rounded hover:text-danger"
              aria-label={`Remove tag ${t}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagDraft);
            }
          }}
          placeholder="Add tag (press Enter)…"
          className="h-7 w-[200px] text-xs"
        />
      </div>

      <details className="group border-t border-border pt-2 text-xs">
        <summary className="cursor-pointer list-none font-medium text-muted [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1">
            <FolderPlus className="size-3.5" />
            Groups (optional)
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-[160px] flex-1">
            <span className="text-muted">This play&apos;s group</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm text-foreground"
              value={currentGroupId}
              onChange={(e) => {
                const v = e.target.value;
                handleAssignGroup(v === "" ? null : v);
              }}
              disabled={busy}
            >
              <option value="">Ungrouped</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-1 flex-wrap gap-2">
            <Input
              placeholder="New group name…"
              value={groupNameDraft}
              onChange={(e) => setGroupNameDraft(e.target.value)}
              className="min-w-[140px] flex-1"
            />
            <Button type="button" size="sm" variant="secondary" onClick={handleCreateGroup} disabled={busy}>
              Create group
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
