"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Archive, ArrowLeft, Check, CheckSquare, ChevronDown, Copy, FlaskConical, Globe, History, Home, Lock, LogOut, Mail, MailX, MoreVertical, Plus, Printer, QrCode, Settings2, Trash2, Unlock, UserPlus, X } from "lucide-react";
import QRCode from "qrcode";
import {
  Button,
  Input,
  LogoPicker,
  SegmentedControl,
  useToast,
} from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import {
  archivePlaybookAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  leavePlaybookAction,
  renamePlaybookAction,
  setPlaybookAllowDuplicationAction,
  updatePlaybookAppearanceAction,
  updatePlaybookSeasonAction,
  updatePlaybookSettingsAction,
} from "@/app/actions/playbooks";
import type { PlaybookSettings } from "@/domain/playbook/settings";
import { PlaybookRulesForm } from "@/features/playbooks/PlaybookRulesForm";
import {
  createInviteAction,
  revokeAllInvitesAction,
  sharePlaybookWithEmailsAction,
  type ShareResultRow,
} from "@/app/actions/invites";
import { getInviteSeatStatusAction } from "@/app/actions/billing";
import {
  duplicateAsExampleAction,
  setPlaybookExampleAuthorLabelAction,
  setPlaybookIsExampleAction,
  setPlaybookPublicExampleAction,
} from "@/app/actions/admin-examples";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

const PALETTE = [
  "#F26522", "#EF4444", "#EAB308", "#22C55E",
  "#3B82F6", "#A855F7", "#EC4899", "#1C1C1E",
];

function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export type PlaybookHeaderPlayActions = {
  onNewPlay: () => void;
  onToggleSelect: () => void;
  selectionMode: boolean;
  creating: boolean;
  printHref: string;
  newFormationHref: string;
  isViewer: boolean;
};

export type ExampleAdminState = {
  isExample: boolean;
  isPublished: boolean;
  authorLabel: string | null;
};

export function PlaybookHeader({
  playbookId,
  name,
  season,
  variantLabel,
  settings,
  logoUrl,
  accentColor,
  canManage,
  canShare,
  viewerIsCoach,
  senderName,
  ownerDisplayName,
  allowCoachDuplication,
  allowPlayerDuplication,
  allowGameResultsDuplication,
  gameResultsAvailable,
  playActions,
  exampleAdmin,
  exampleStatus,
  isExamplePreview,
  isArchived,
  outstandingInviteCount,
  versionHistoryAvailable,
  onOpenTrash,
}: {
  playbookId: string;
  name: string;
  season: string | null;
  variantLabel: string;
  settings: PlaybookSettings;
  logoUrl: string | null;
  accentColor: string;
  canManage: boolean;
  canShare: boolean;
  viewerIsCoach: boolean;
  senderName?: string | null;
  ownerDisplayName?: string | null;
  allowCoachDuplication?: boolean;
  allowPlayerDuplication?: boolean;
  allowGameResultsDuplication?: boolean;
  gameResultsAvailable?: boolean;
  playActions?: PlaybookHeaderPlayActions;
  exampleAdmin?: ExampleAdminState | null;
  exampleStatus?: { isPublished: boolean } | null;
  isExamplePreview?: boolean;
  isArchived?: boolean;
  outstandingInviteCount?: number;
  versionHistoryAvailable?: boolean;
  onOpenTrash?: (() => void) | null;
}) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{ title: string; message: string } | null>(null);

  function openInvite() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Sharing a playbook is a Coach feature",
        message: "Upgrade to Coach ($9/mo or $99/yr) to invite teammates and share playbooks.",
      });
      return;
    }
    setInviteOpen(true);
  }

  function openDuplicate() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Duplicating playbooks is a Coach feature",
        message: "Upgrade to Coach ($9/mo or $99/yr) to duplicate playbooks.",
      });
      return;
    }
    setDuplicateOpen(true);
  }
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams) return;
    let changed = false;
    const params = new URLSearchParams(searchParams.toString());
    if (canShare && searchParams.get("share") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate from URL query param
      if (viewerIsCoach) {
        setInviteOpen(true);
      } else {
        setUpgradeNotice({
          title: "Sharing a playbook is a Coach feature",
          message: "Upgrade to Coach ($9/mo or $99/yr) to invite teammates and share playbooks.",
        });
      }
      params.delete("share");
      changed = true;
    }
    if (canManage && searchParams.get("customize") === "1") {
      setCustomizeOpen(true);
      params.delete("customize");
      changed = true;
    }
    if (changed) {
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
  }, [canManage, canShare, viewerIsCoach, searchParams, router]);

  function run(
    fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; id?: string }>,
    onOk?: (r: { ok: true; id?: string }) => void,
  ) {
    fn().then((res) => {
      if (!res.ok) {
        toast(("error" in res && res.error) || "Something went wrong.", "error");
        return;
      }
      onOk?.(res as { ok: true; id?: string });
      router.refresh();
    });
  }

  function handleDuplicate(newName: string, copyGameResults: boolean) {
    setDuplicateOpen(false);
    run(
      () => duplicatePlaybookAction(playbookId, newName, { copyGameResults }),
      (res) => {
        if (res.id) router.push(`/playbooks/${res.id}`);
      },
    );
  }

  function handleToggleCoachDup() {
    run(() =>
      setPlaybookAllowDuplicationAction(playbookId, "coach", !allowCoachDuplication),
    );
  }

  function handleTogglePlayerDup() {
    run(() =>
      setPlaybookAllowDuplicationAction(playbookId, "player", !allowPlayerDuplication),
    );
  }

  function handleToggleGameResultsDup() {
    run(() =>
      setPlaybookAllowDuplicationAction(
        playbookId,
        "game_results",
        !allowGameResultsDuplication,
      ),
    );
  }

  function handleArchive() {
    run(() => archivePlaybookAction(playbookId, true), () => router.push("/home"));
  }

  function handleUnarchive() {
    run(() => archivePlaybookAction(playbookId, false));
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${name}" and all its plays? This can't be undone.`)) return;
    run(() => deletePlaybookAction(playbookId), () => router.push("/home"));
  }

  function handleLeave() {
    if (!window.confirm(`Leave "${name}"? You'll lose access until a coach re-invites you.`)) return;
    run(() => leavePlaybookAction(playbookId), () => router.push("/home"));
  }

  function handleToggleExample() {
    if (exampleAdmin?.isExample) {
      run(() => setPlaybookIsExampleAction(playbookId, false));
      return;
    }
    // "Use as example" forks this playbook into a new one the admin owns
    // so future edits to the original don't bleed into the published
    // example. Jump the admin into the copy so they can tweak it.
    run(
      () => duplicateAsExampleAction(playbookId),
      (res) => {
        if (res.id) router.push(`/playbooks/${res.id}`);
      },
    );
  }

  function handleRevokeAllInvites() {
    const n = outstandingInviteCount ?? 0;
    if (n <= 0) return;
    if (!window.confirm(
      `Revoke ${n} outstanding invite${n === 1 ? "" : "s"}? Anyone who hasn't joined yet will need a new link.`,
    )) return;
    run(() => revokeAllInvitesAction(playbookId).then((r) =>
      r.ok ? { ok: true } : { ok: false, error: r.error },
    ));
  }

  function handleTogglePublishExample() {
    const next = !(exampleAdmin?.isPublished ?? false);
    run(() => setPlaybookPublicExampleAction(playbookId, next));
  }

  const isLightBg = hexLuminance(accentColor) > 0.55;
  const onAccent = isLightBg ? "text-slate-900" : "text-white";
  const onAccentMuted = isLightBg ? "text-slate-700" : "text-white/80";
  const onAccentHover = isLightBg ? "hover:bg-black/10" : "hover:bg-white/15";
  const gradient = `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 55%, ${accentColor}a8 100%)`;
  const initial = name.trim().charAt(0).toUpperCase();
  const homeHref = isExamplePreview ? "/examples" : "/home";

  return (
    <>
      <div
        className="relative -mx-6 -mt-3"
        style={{ background: gradient }}
      >
        <div className="relative mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <Link
            href={homeHref}
            className={`hidden sm:inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors ${onAccentMuted} ${onAccentHover}`}
            aria-label="Back to home"
          >
            <ArrowLeft className="size-4" />
            Home
          </Link>
          <div className={`hidden sm:block ${isLightBg ? "h-6 w-px bg-black/20" : "h-6 w-px bg-white/25"}`} />
          <div
            className={`relative size-9 sm:size-11 shrink-0 overflow-hidden rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg font-extrabold ring-1 ${
              isLightBg ? "bg-white/80 ring-black/10" : "bg-white/20 ring-white/30"
            } ${onAccent}`}
          >
            {logoUrl ? (
              <Image src={logoUrl} alt="" fill className="object-contain p-1" sizes="44px" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className={`truncate text-base font-extrabold tracking-tight sm:text-2xl ${onAccent}`}>
                {name}
              </h1>
              {exampleStatus && (
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isLightBg
                      ? "bg-black/10 text-slate-900"
                      : "bg-white/20 text-white"
                  }`}
                  title={
                    exampleStatus.isPublished
                      ? "Published as a public example"
                      : "Marked as example — not yet published"
                  }
                >
                  <FlaskConical className="size-3" />
                  {exampleStatus.isPublished ? "Example · Published" : "Example · Draft"}
                </span>
              )}
              {isExamplePreview && (
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isLightBg
                      ? "bg-black/10 text-slate-900"
                      : "bg-white/20 text-white"
                  }`}
                  title="You're viewing an example playbook. Changes won't be saved."
                >
                  <FlaskConical className="size-3" />
                  Example
                </span>
              )}
              {isArchived && (
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isLightBg
                      ? "bg-black/10 text-slate-900"
                      : "bg-white/20 text-white"
                  }`}
                  title="This playbook is archived and can't be edited."
                >
                  <Archive className="size-3" />
                  Archived
                </span>
              )}
            </div>
            <p className={`truncate text-[11px] font-medium sm:text-sm ${onAccentMuted}`}>
              {[
                season,
                variantLabel,
                ownerDisplayName ? `Shared by ${ownerDisplayName}` : senderName,
              ]
                .filter(Boolean)
                .join(" · ") || variantLabel}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canShare && (
              <Button
                size="sm"
                leftIcon={UserPlus}
                onClick={openInvite}
                className={`hidden sm:inline-flex ${
                  isLightBg
                    ? "!bg-slate-900 !text-white hover:!bg-slate-800"
                    : "!bg-white !text-slate-900 hover:!bg-white/90"
                }`}
              >
                Invite Team Member
              </Button>
            )}
            {isExamplePreview && (
              <Link
                href="/home"
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${
                  isLightBg
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-white text-slate-900 hover:bg-white/90"
                }`}
              >
                Create your own
              </Link>
            )}
            {(canShare || canManage || playActions || exampleAdmin) && (
              <HeaderMenu
                homeHref={homeHref}
                onAccent={onAccent}
                onAccentHover={onAccentHover}
                onInvite={canShare ? openInvite : null}
                onCustomize={canManage ? () => setCustomizeOpen(true) : null}
                onRevokeAllInvites={
                  canShare && (outstandingInviteCount ?? 0) > 0
                    ? handleRevokeAllInvites
                    : null
                }
                outstandingInviteCount={outstandingInviteCount ?? 0}
                onDuplicate={canManage ? openDuplicate : null}
                historyHref={
                  versionHistoryAvailable ? `/playbooks/${playbookId}/history` : null
                }
                onOpenTrash={versionHistoryAvailable ? (onOpenTrash ?? null) : null}
                onArchive={canManage && !isArchived ? handleArchive : null}
                onUnarchive={canManage && isArchived ? handleUnarchive : null}
                onDelete={canManage ? handleDelete : null}
                onLeave={!canManage ? handleLeave : null}
                playActions={playActions}
                exampleAdmin={exampleAdmin ?? null}
                onToggleExample={exampleAdmin ? handleToggleExample : null}
                onTogglePublishExample={
                  exampleAdmin?.isExample ? handleTogglePublishExample : null
                }
              />
            )}
          </div>
        </div>
      </div>

      {customizeOpen && (
        <CustomizeTeamDialog
          playbookId={playbookId}
          initialName={name}
          initialSeason={season ?? ""}
          initialLogoUrl={logoUrl ?? ""}
          initialColor={accentColor}
          initialSettings={settings}
          variantLabel={variantLabel}
          initialExampleAuthorLabel={
            exampleAdmin?.isExample ? exampleAdmin.authorLabel : null
          }
          showExampleAuthorLabel={Boolean(exampleAdmin?.isExample)}
          onClose={() => setCustomizeOpen(false)}
          duplicationSettings={
            canManage
              ? {
                  allowCoachDuplication: allowCoachDuplication ?? true,
                  allowPlayerDuplication: allowPlayerDuplication ?? true,
                  allowGameResultsDuplication: allowGameResultsDuplication ?? false,
                  gameResultsAvailable: gameResultsAvailable ?? false,
                  onToggleCoach: handleToggleCoachDup,
                  onTogglePlayer: handleTogglePlayerDup,
                  onToggleGameResults: handleToggleGameResultsDup,
                }
              : null
          }
        />
      )}

      {inviteOpen && (
        <InviteTeamMemberDialog
          playbookId={playbookId}
          teamName={name}
          senderName={senderName ?? null}
          canManage={canManage}
          allowCoachDuplication={allowCoachDuplication ?? true}
          onToggleCoachDuplication={canManage ? handleToggleCoachDup : null}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {duplicateOpen && (
        <DuplicatePlaybookDialog
          playbookName={name}
          allowGameResultsCopy={Boolean(
            allowGameResultsDuplication && gameResultsAvailable,
          )}
          onClose={() => setDuplicateOpen(false)}
          onDuplicate={handleDuplicate}
        />
      )}

      <UpgradeModal
        open={!!upgradeNotice}
        onClose={() => setUpgradeNotice(null)}
        title={upgradeNotice?.title ?? ""}
        message={upgradeNotice?.message ?? ""}
      />
    </>
  );
}

function DuplicatePlaybookDialog({
  playbookName,
  allowGameResultsCopy,
  onClose,
  onDuplicate,
}: {
  playbookName: string;
  allowGameResultsCopy: boolean;
  onClose: () => void;
  onDuplicate: (name: string, copyGameResults: boolean) => void;
}) {
  const [name, setName] = useState(`${playbookName} (copy)`);
  const [copyGameResults, setCopyGameResults] = useState(false);
  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onDuplicate(trimmed, allowGameResultsCopy && copyGameResults);
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">Duplicate playbook</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted">
            This will copy every play in <span className="font-medium text-foreground">{playbookName}</span> into a new playbook you own.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
          {allowGameResultsCopy && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-inset/50 p-3">
              <input
                type="checkbox"
                checked={copyGameResults}
                onChange={(e) => setCopyGameResults(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-border"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  Also copy game results
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Include completed game sessions, play calls, and score events from the source playbook.
                </p>
              </div>
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Create copy
          </Button>
        </div>
      </div>
    </div>
  );
}

function DupToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm text-foreground">{label}</span>
      <input
        type="checkbox"
        checked={on}
        onChange={onToggle}
        className="size-4 shrink-0 rounded border-border"
      />
    </label>
  );
}

const menuItemCls =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset";

function SectionLabel({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${
        danger ? "text-danger" : "text-muted"
      }`}
    >
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div className="my-1 h-px bg-border" />;
}

function HeaderMenu({
  homeHref,
  onAccent,
  onAccentHover,
  onInvite,
  onRevokeAllInvites,
  outstandingInviteCount,
  onCustomize,
  onDuplicate,
  historyHref,
  onOpenTrash,
  onArchive,
  onUnarchive,
  onDelete,
  onLeave,
  playActions,
  exampleAdmin,
  onToggleExample,
  onTogglePublishExample,
}: {
  homeHref: string;
  onAccent: string;
  onAccentHover: string;
  onInvite: (() => void) | null;
  onRevokeAllInvites: (() => void) | null;
  outstandingInviteCount: number;
  onCustomize: (() => void) | null;
  onDuplicate: (() => void) | null;
  historyHref: string | null;
  onOpenTrash: (() => void) | null;
  onArchive: (() => void) | null;
  onUnarchive: (() => void) | null;
  onDelete: (() => void) | null;
  onLeave: (() => void) | null;
  playActions?: PlaybookHeaderPlayActions;
  exampleAdmin: ExampleAdminState | null;
  onToggleExample: (() => void) | null;
  onTogglePublishExample: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Team options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-9 items-center justify-center rounded-lg transition-colors ${onAccent} ${onAccentHover}`}
      >
        <MoreVertical className="size-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
        >
          {/* Mobile-only navigation */}
          <div className="sm:hidden">
            <SectionLabel>Navigate</SectionLabel>
            <Link
              href={homeHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={menuItemCls}
            >
              <Home className="size-4 shrink-0" />
              <span>Home</span>
            </Link>
            {onInvite && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onInvite();
                }}
                className={menuItemCls}
              >
                <UserPlus className="size-4 shrink-0" />
                <span>Invite team member</span>
              </button>
            )}
          </div>

          {/* Mobile-only play actions */}
          {playActions && (
            <div className="sm:hidden">
              <SectionDivider />
              <SectionLabel>Plays</SectionLabel>
              <button
                type="button"
                role="menuitem"
                disabled={playActions.creating}
                onClick={() => {
                  setOpen(false);
                  playActions.onNewPlay();
                }}
                title={playActions.isViewer ? "Viewers can't create plays" : undefined}
                className={`${menuItemCls} disabled:opacity-50${playActions.isViewer ? " opacity-60" : ""}`}
              >
                <Plus className="size-4 shrink-0" />
                <span>New play</span>
              </button>
              {!playActions.isViewer && (
                <Link
                  href={playActions.newFormationHref}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={menuItemCls}
                >
                  <Plus className="size-4 shrink-0" />
                  <span>New formation</span>
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  playActions.onToggleSelect();
                }}
                className={menuItemCls}
              >
                <CheckSquare className="size-4 shrink-0" />
                <span>{playActions.selectionMode ? "Cancel selection" : "Select plays"}</span>
              </button>
              <Link
                href={playActions.printHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={menuItemCls}
              >
                <Printer className="size-4 shrink-0" />
                <span>Print playbook</span>
              </Link>
            </div>
          )}

          {/* Manage */}
          {(onCustomize || onDuplicate || historyHref || onOpenTrash) && (
            <>
              <SectionDivider />
              <SectionLabel>Manage</SectionLabel>
              {onCustomize && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onCustomize();
                  }}
                  className={menuItemCls}
                >
                  <Settings2 className="size-4 shrink-0" />
                  <span>Customize</span>
                </button>
              )}
              {onDuplicate && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onDuplicate();
                  }}
                  className={menuItemCls}
                >
                  <Copy className="size-4 shrink-0" />
                  <span>Duplicate</span>
                </button>
              )}
              {historyHref && (
                <Link
                  href={historyHref}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={menuItemCls}
                >
                  <History className="size-4 shrink-0" />
                  <span>History</span>
                </Link>
              )}
              {onOpenTrash && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onOpenTrash();
                  }}
                  className={menuItemCls}
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span>Trash</span>
                </button>
              )}
            </>
          )}

          {/* Team */}
          {onRevokeAllInvites && (
            <>
              <SectionDivider />
              <SectionLabel>Team</SectionLabel>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRevokeAllInvites();
                }}
                className={menuItemCls}
              >
                <MailX className="size-4 shrink-0" />
                <span className="flex-1 truncate">Revoke outstanding invites</span>
                <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                  {outstandingInviteCount}
                </span>
              </button>
            </>
          )}

          {/* Status */}
          {(onArchive || onUnarchive) && (
            <>
              <SectionDivider />
              <SectionLabel>Status</SectionLabel>
              {onArchive && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onArchive();
                  }}
                  className={menuItemCls}
                >
                  <Archive className="size-4 shrink-0" />
                  <span>Archive</span>
                </button>
              )}
              {onUnarchive && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onUnarchive();
                  }}
                  className={menuItemCls}
                >
                  <Archive className="size-4 shrink-0" />
                  <span>Restore playbook</span>
                </button>
              )}
            </>
          )}

          {/* Site admin */}
          {exampleAdmin && onToggleExample && (
            <>
              <SectionDivider />
              <SectionLabel>Site admin</SectionLabel>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onToggleExample();
                }}
                className={menuItemCls}
              >
                <FlaskConical className="size-4 shrink-0" />
                <span>
                  {exampleAdmin.isExample ? "Remove as example" : "Use as example"}
                </span>
              </button>
              {onTogglePublishExample && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onTogglePublishExample();
                  }}
                  className={menuItemCls}
                >
                  <Globe className="size-4 shrink-0" />
                  <span>
                    {exampleAdmin.isPublished ? "Unpublish example" : "Publish example"}
                  </span>
                </button>
              )}
            </>
          )}

          {/* Danger zone */}
          {(onDelete || onLeave) && (
            <>
              <SectionDivider />
              <SectionLabel danger>Danger zone</SectionLabel>
              {onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-light"
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span>Delete playbook</span>
                </button>
              )}
              {onLeave && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onLeave();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-light"
                >
                  <LogOut className="size-4 shrink-0" />
                  <span>Leave playbook</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CustomizeTeamDialog({
  playbookId,
  initialName,
  initialSeason,
  initialLogoUrl,
  initialColor,
  initialSettings,
  variantLabel,
  initialExampleAuthorLabel,
  showExampleAuthorLabel,
  onClose,
  duplicationSettings,
}: {
  playbookId: string;
  initialName: string;
  initialSeason: string;
  initialLogoUrl: string;
  initialColor: string;
  initialSettings: PlaybookSettings;
  variantLabel: string;
  initialExampleAuthorLabel?: string | null;
  showExampleAuthorLabel?: boolean;
  onClose: () => void;
  duplicationSettings?: {
    allowCoachDuplication: boolean;
    allowPlayerDuplication: boolean;
    allowGameResultsDuplication: boolean;
    gameResultsAvailable: boolean;
    onToggleCoach: () => void;
    onTogglePlayer: () => void;
    onToggleGameResults: () => void;
  } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [season, setSeason] = useState(initialSeason);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [color, setColor] = useState(initialColor);
  const [settings, setSettings] = useState<PlaybookSettings>(initialSettings);
  const [authorLabel, setAuthorLabel] = useState(initialExampleAuthorLabel ?? "");
  const [saving, setSaving] = useState(false);

  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";

  async function save() {
    if (!name.trim()) {
      toast("Team name can't be empty.", "error");
      return;
    }
    setSaving(true);
    try {
      if (name.trim() !== initialName) {
        const r = await renamePlaybookAction(playbookId, name);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (season.trim() !== (initialSeason ?? "").trim()) {
        const r = await updatePlaybookSeasonAction(playbookId, season);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (color !== initialColor || (logoUrl || "") !== (initialLogoUrl || "")) {
        const r = await updatePlaybookAppearanceAction(playbookId, {
          logo_url: logoUrl || null,
          color: color || null,
        });
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (JSON.stringify(settings) !== JSON.stringify(initialSettings)) {
        const r = await updatePlaybookSettingsAction(playbookId, settings);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (showExampleAuthorLabel) {
        const before = (initialExampleAuthorLabel ?? "").trim();
        const after = authorLabel.trim();
        if (before !== after) {
          const r = await setPlaybookExampleAuthorLabelAction(
            playbookId,
            after || null,
          );
          if (!r.ok) {
            toast(r.error, "error");
            return;
          }
        }
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">Customize playbook</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div
            className="flex h-24 items-center justify-center rounded-lg"
            style={{ backgroundColor: color }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
            ) : (
              <span className="text-3xl font-black tracking-tight text-white drop-shadow">
                {initials}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Team name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Season <span className="font-normal normal-case text-muted">(optional)</span>
            </label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g. Spring 2026"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Team color
            </label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      active ? "border-foreground scale-110" : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                );
              })}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border-2 border-border"
                aria-label="Custom color"
              />
            </div>
          </div>

          <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={saving} />

          {showExampleAuthorLabel && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Example author label{" "}
                <span className="font-normal normal-case text-muted">
                  (shown on the public /examples card)
                </span>
              </label>
              <Input
                value={authorLabel}
                onChange={(e) => setAuthorLabel(e.target.value)}
                placeholder='e.g. "Coach Jane" or "You!"'
                maxLength={60}
              />
            </div>
          )}

          {duplicationSettings && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Duplication
              </label>
              <div className="space-y-1.5 rounded-lg border border-border bg-surface-inset/50 p-3">
                <DupToggleRow
                  label="Coaches can duplicate this playbook"
                  on={duplicationSettings.allowCoachDuplication}
                  onToggle={duplicationSettings.onToggleCoach}
                />
                <DupToggleRow
                  label="Players can duplicate this playbook"
                  on={duplicationSettings.allowPlayerDuplication}
                  onToggle={duplicationSettings.onTogglePlayer}
                />
                {duplicationSettings.gameResultsAvailable && (
                  <DupToggleRow
                    label="Allow copying game results"
                    on={duplicationSettings.allowGameResultsDuplication}
                    onToggle={duplicationSettings.onToggleGameResults}
                  />
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Game type
              </label>
              <span className="text-xs text-muted">{variantLabel}</span>
            </div>
            <PlaybookRulesForm value={settings} onChange={setSettings} disabled={saving} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function InviteTeamMemberDialog({
  playbookId,
  teamName,
  senderName,
  canManage = false,
  allowCoachDuplication = true,
  onToggleCoachDuplication = null,
  onClose,
}: {
  playbookId: string;
  teamName: string;
  senderName: string | null;
  canManage?: boolean;
  allowCoachDuplication?: boolean;
  onToggleCoachDuplication?: (() => void) | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "email" | "link">("choose");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkTab, setLinkTab] = useState<"link" | "qr">("link");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [shareResults, setShareResults] = useState<ShareResultRow[] | null>(null);
  const [autoApprove, setAutoApprove] = useState(true);
  const [autoApproveLimit, setAutoApproveLimit] = useState<string>("25");
  const [seatStatus, setSeatStatus] = useState<{
    isCoachPlus: boolean;
    used: number;
    total: number;
    available: number;
    canManageSeats: boolean;
  } | null>(null);
  const [permsOpen, setPermsOpen] = useState(false);
  const outOfCoachSeats =
    role === "editor" && seatStatus?.isCoachPlus === true && seatStatus.available <= 0;
  const needsCoachPlan =
    role === "editor" && seatStatus?.isCoachPlus === false;
  const parsedEmailCount = emailInput
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean).length;
  const coachOverCap =
    role === "editor" &&
    seatStatus?.isCoachPlus === true &&
    parsedEmailCount > seatStatus.available;

  useEffect(() => {
    let cancelled = false;
    getInviteSeatStatusAction(playbookId).then((res) => {
      if (cancelled || !res.ok) return;
      setSeatStatus({
        isCoachPlus: res.isCoachPlus,
        used: res.used,
        total: res.total,
        available: res.available,
        canManageSeats: res.canManageSeats,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [playbookId]);

  async function generate() {
    setCreating(true);
    const parsedLimit =
      autoApprove && autoApproveLimit.trim() !== ""
        ? Math.max(1, Math.floor(Number(autoApproveLimit)))
        : null;
    // Coach links are seat-bound, so force single-use. Player links
    // stay unlimited per existing behavior.
    const res = await createInviteAction({
      playbookId,
      role,
      expiresInDays: 14,
      maxUses: role === "editor" ? 1 : null,
      email: null,
      note: null,
      autoApprove,
      autoApproveLimit: role === "editor" ? null : parsedLimit,
    });
    setCreating(false);
    if (!res.ok) {
      toast(`Could not create invite: ${res.error}`, "error");
      return;
    }
    const url = `${SITE_URL}/invite/${res.invite.token}`;
    setInviteUrl(url);
  }

  useEffect(() => {
    if (!inviteUrl) return;
    let cancelled = false;
    QRCode.toDataURL(inviteUrl, { width: 320, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  async function copy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed — select and copy the link manually.", "error");
    }
  }

  async function shareByEmails() {
    const emails = emailInput
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast("Enter at least one email.", "error");
      return;
    }
    setSending(true);
    const res = await sharePlaybookWithEmailsAction({
      playbookId,
      role,
      emails,
      teamName,
      senderName,
    });
    setSending(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    setShareResults(res.results);
    const added = res.results.filter((r) => r.kind === "added").length;
    const invited = res.results.filter((r) => r.kind === "invited").length;
    const already = res.results.filter((r) => r.kind === "already_member").length;
    const failed = res.results.filter((r) => r.kind === "failed").length;
    const bits: string[] = [];
    if (added) bits.push(`${added} added`);
    if (invited) bits.push(`${invited} invited`);
    if (already) bits.push(`${already} already a member`);
    if (failed) bits.push(`${failed} failed`);
    toast(bits.join(" · ") || "Done.", failed ? "error" : "success");
    if (added > 0) router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              {mode === "choose"
                ? "Invite team member"
                : role === "editor"
                  ? "Invite coach"
                  : "Invite player"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">Share a link, QR code, or email.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {mode === "choose" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Role</label>
                <SegmentedControl
                  value={role}
                  onChange={(v) => setRole(v as "viewer" | "editor")}
                  options={[
                    { value: "viewer", label: "Player" },
                    { value: "editor", label: "Coach" },
                  ]}
                />
                <p className="mt-1.5 text-xs text-muted">
                  Players can view plays and notes. Coaches can edit and
                  delete plays, manage your roster, and invite others — same
                  as you.
                </p>
                {role === "editor" && (outOfCoachSeats || needsCoachPlan) && (
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-danger-light px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div className="flex-1">
                      {needsCoachPlan ? (
                        <>
                          <strong>Coaches need a Team Coach plan.</strong>
                          {" "}You can keep inviting players for free.{" "}
                          <Link
                            href="/pricing"
                            className="font-medium underline hover:no-underline"
                          >
                            See pricing
                          </Link>
                        </>
                      ) : (
                        <>
                          <strong>Out of coach seats.</strong>{" "}
                          {seatStatus?.used ?? 0} of {seatStatus?.total ?? 0}{" "}
                          in use.{" "}
                          {seatStatus?.canManageSeats ? (
                            <Link
                              href="/account"
                              className="font-medium underline hover:no-underline"
                            >
                              Add a seat or remove a coach
                            </Link>
                          ) : (
                            <span>Ask the playbook owner to add a seat.</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
                {role === "editor" && !outOfCoachSeats && !needsCoachPlan && (
                  <div className="mt-2 rounded-md bg-warning-light text-xs text-warning ring-1 ring-warning/30">
                    <button
                      type="button"
                      onClick={() => setPermsOpen((v) => !v)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span className="flex-1">
                        Coaches get full edit access. Tap for what they can
                        and can&rsquo;t do.
                      </span>
                      <ChevronDown
                        className={`mt-0.5 size-4 shrink-0 transition-transform ${permsOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {permsOpen && (
                      <div className="space-y-2 border-t border-warning/20 px-3 py-2">
                        <ul className="ml-4 list-disc space-y-0.5">
                          <li>Add, edit, and delete plays</li>
                          <li>Manage the roster — invite, remove, demote</li>
                          <li>
                            Cannot remove you or transfer ownership; you can
                            demote them back to player anytime
                          </li>
                        </ul>
                        {onToggleCoachDuplication ? (
                          <label className="flex cursor-pointer items-start gap-2 rounded-md bg-warning-light/60 px-2 py-1.5 ring-1 ring-warning/20">
                            <input
                              type="checkbox"
                              checked={allowCoachDuplication}
                              onChange={onToggleCoachDuplication}
                              className="mt-0.5 size-3.5 shrink-0 rounded border-warning/40"
                            />
                            <span className="text-foreground">
                              Allow coaches to duplicate this playbook and
                              copy plays elsewhere
                              <span className="ml-1 text-muted">
                                (applies to all coaches on this playbook)
                              </span>
                            </span>
                          </label>
                        ) : (
                          <p className="text-foreground">
                            Duplication: coaches{" "}
                            <strong>
                              {allowCoachDuplication ? "can" : "cannot"}
                            </strong>{" "}
                            duplicate this playbook or copy plays elsewhere.
                            Only the owner can change this.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMode("email")}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-inset p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Share by email</div>
                  <p className="mt-0.5 text-xs text-muted">
                    Add one or more people by email. Existing users get instant access;
                    new users receive a sign-up link.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("link")}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-inset p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <Copy className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Create share link</div>
                  <p className="mt-0.5 text-xs text-muted">
                    {role === "editor"
                      ? "Single-use link or QR — perfect for handing access to one coach in person."
                      : "Generate a link (or QR code) anyone can use to request access. You still approve each person."}
                  </p>
                </div>
              </button>
            </div>
          )}

          {mode === "email" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setMode("choose");
                  setShareResults(null);
                  setEmailInput("");
                }}
                className="-mt-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
              >
                <ArrowLeft className="size-3" /> Back
              </button>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Emails
                </label>
                {role === "editor" && seatStatus?.isCoachPlus ? (
                  <p className="mb-1.5 text-xs text-muted">
                    <span className="font-medium text-foreground">
                      {Math.max(0, seatStatus.available - parsedEmailCount)}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-foreground">
                      {seatStatus.total}
                    </span>{" "}
                    coach seat{seatStatus.total === 1 ? "" : "s"} available.
                    Coaches with their own paid plan don&rsquo;t use a seat.
                  </p>
                ) : null}
                <textarea
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setShareResults(null);
                  }}
                  placeholder="alex@example.com, jamie@example.com"
                  rows={3}
                  disabled={sending}
                  className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-xs text-muted">
                  Separate with commas, spaces, or new lines.
                </p>
                {role === "editor" && coachOverCap ? (
                  <p className="mt-1 text-xs text-danger">
                    {parsedEmailCount} email{parsedEmailCount === 1 ? "" : "s"}{" "}
                    entered, but only {seatStatus?.available ?? 0} seat
                    {(seatStatus?.available ?? 0) === 1 ? "" : "s"} left. Add
                    a seat in{" "}
                    <Link href="/account" className="underline">
                      Account
                    </Link>{" "}
                    or remove some emails.
                  </p>
                ) : null}
              </div>
              <Button
                variant="primary"
                leftIcon={Mail}
                onClick={shareByEmails}
                loading={sending}
                disabled={!emailInput.trim() || coachOverCap}
                className="w-full"
              >
                Share playbook
              </Button>

              {shareResults && shareResults.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-border bg-surface-inset p-3 text-xs">
                  {shareResults.map((r) => (
                    <li key={r.email} className="flex items-center justify-between gap-2">
                      <span className="truncate text-foreground">{r.email}</span>
                      <span
                        className={
                          r.kind === "failed"
                            ? "shrink-0 text-danger"
                            : r.kind === "already_member"
                              ? "shrink-0 text-muted"
                              : "shrink-0 text-field"
                        }
                      >
                        {r.kind === "added"
                          ? "Added"
                          : r.kind === "invited"
                            ? "Invite sent"
                            : r.kind === "already_member"
                              ? "Already a member"
                              : `Failed: ${r.error}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {mode === "link" && !inviteUrl && (
            <>
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="-mt-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
              >
                <ArrowLeft className="size-3" /> Back
              </button>
              {role === "editor" && (
                <div className="flex items-start gap-2 rounded-md bg-warning-light px-3 py-2 text-xs text-warning ring-1 ring-warning/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong>Edit-access link.</strong> Anyone who opens this
                    link joins as a coach with full edit, delete, and invite
                    rights. Share carefully — and remember you can revoke the
                    link or demote individuals later.
                  </span>
                </div>
              )}
              {role === "editor" ? (
                <div className="rounded-lg border border-border bg-surface-inset/50 p-3 text-xs text-muted">
                  Single-use coach link — works for one person, then expires.
                  Hand off the link or QR in person; the next coach gets a
                  fresh one.
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-surface-inset/50 p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 rounded border-border"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        Anyone with this link can join immediately
                      </div>
                      {autoApprove ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>Up to</span>
                          <Input
                            value={autoApproveLimit}
                            onChange={(e) => setAutoApproveLimit(e.target.value)}
                            placeholder="unlimited"
                            className="h-7 w-20 text-xs"
                          />
                          <span>user{autoApproveLimit.trim() === "1" ? "" : "s"} — after that, you&apos;ll approve each new person.</span>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted">
                          You&apos;ll approve every joiner from the Roster tab.
                        </p>
                      )}
                    </div>
                  </label>
                </div>
              )}
              <p className="text-xs text-muted">Link is valid for 14 days.</p>
              <Button
                variant="primary"
                onClick={generate}
                loading={creating}
                disabled={role === "editor" && (outOfCoachSeats || needsCoachPlan)}
                className="w-full"
              >
                Create invite link
              </Button>
            </>
          )}

          {mode === "link" && inviteUrl && (
            <>
              {role === "editor" && (
                <div className="flex items-start gap-2 rounded-md bg-warning-light px-3 py-2 text-xs text-warning ring-1 ring-warning/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Edit-access link — joiners become coaches.
                  </span>
                </div>
              )}
              <div className="flex gap-1 rounded-lg border border-border bg-surface-inset p-1">
                {(
                  [
                    { key: "link" as const, label: "Copy link", icon: Copy },
                    { key: "qr" as const, label: "QR code", icon: QrCode },
                  ]
                ).map((t) => {
                  const Icon = t.icon;
                  const active = linkTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setLinkTab(t.key)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "bg-surface-raised text-foreground shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {linkTab === "link" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-3 py-2">
                    <code className="flex-1 truncate text-xs text-foreground">{inviteUrl}</code>
                    <Button size="sm" variant="primary" leftIcon={copied ? Check : Copy} onClick={copy}>
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    Paste this anywhere — text, group chat, email. Anyone with the link can request to join.
                  </p>
                </div>
              )}

              {linkTab === "qr" && (
                <div className="flex flex-col items-center gap-3">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt="Invite QR code"
                      className="size-56 rounded-lg border border-border bg-white p-2"
                    />
                  ) : (
                    <div className="flex size-56 items-center justify-center rounded-lg border border-border bg-surface-inset text-xs text-muted">
                      Generating…
                    </div>
                  )}
                  <p className="text-center text-xs text-muted">
                    Scan with a phone camera to open the invite link.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
