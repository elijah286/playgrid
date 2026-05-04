"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Archive, ArrowLeft, Check, CheckSquare, ChevronDown, Copy, CreditCard, FlaskConical, Globe, History, Lock, LogOut, Mail, MailX, MoreVertical, Plus, Printer, QrCode, Send, Settings2, Sparkles, Trash2, Unlock, UserPlus, X } from "lucide-react";
import QRCode from "qrcode";
import {
  Button,
  Input,
  LogoPicker,
  SegmentedControl,
  useToast,
} from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { CoachAiLauncher } from "@/features/coach-ai/CoachAiLauncher";
import {
  archivePlaybookAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  getPlaybookKbCountAction,
  leavePlaybookAction,
  renamePlaybookAction,
  setPlaybookAllowDuplicationAction,
  updatePlaybookAppearanceAction,
  updatePlaybookSeasonAction,
  updatePlaybookSettingsAction,
} from "@/app/actions/playbooks";
import { createCopyLinkAction } from "@/app/actions/copy-links";
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
  setPlaybookHeroExampleAction,
  setPlaybookIsExampleAction,
  setPlaybookPublicExampleAction,
} from "@/app/actions/admin-examples";
import { DownloadForOfflineButton } from "@/components/offline/DownloadForOfflineButton";
import { nativeShare } from "@/lib/native/share";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";
import { tagShareUrl } from "@/lib/share/tag-url";

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
  /** When null, the "New formation" item in the mobile kebab menu is
   *  suppressed. We use null for brand-new playbooks (zero plays) so the
   *  only "create" affordance is "New play" — formations are an advanced
   *  concept that lured at least two new users (Anton 04/29, Ralph 04/30)
   *  off the play-creation path. Reappears once a play exists. */
  newFormationHref: string | null;
  isViewer: boolean;
};

export type ExampleAdminState = {
  isExample: boolean;
  isPublished: boolean;
  isHero: boolean;
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
  suggestedDuplicateName,
  playActions,
  exampleAdmin,
  exampleStatus,
  isExamplePreview,
  isArchived,
  outstandingInviteCount,
  versionHistoryAvailable,
  onOpenTrash,
  coachAiAvailable,
  showCoachCalPromo,
  coachAiEvalDays,
  isAdmin,
  referralConfig,
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
  /** Smart-default name for the duplicate dialog (e.g. "Eli's Flag Playbook").
   *  Encourages owners and copiers to rename rather than ship "(copy)". */
  suggestedDuplicateName?: string;
  playActions?: PlaybookHeaderPlayActions;
  exampleAdmin?: ExampleAdminState | null;
  exampleStatus?: { isPublished: boolean } | null;
  isExamplePreview?: boolean;
  isArchived?: boolean;
  outstandingInviteCount?: number;
  versionHistoryAvailable?: boolean;
  onOpenTrash?: (() => void) | null;
  /** Drives the in-banner mobile Coach Cal launcher. When false, the launcher
   *  shows the marketing popover; the chat itself is unreachable. */
  coachAiAvailable?: boolean;
  /** When true, render the launcher even though the user isn't entitled —
   *  it'll show the marketing popover. Mirrors SiteHeader's logic. */
  showCoachCalPromo?: boolean;
  /** Coach AI eval window length in days (admin-configurable). */
  coachAiEvalDays: number;
  isAdmin?: boolean;
  /** When set and enabled, the Share dialog surfaces a referral-credit promo. */
  referralConfig?: import("@/lib/site/referral-config").ReferralConfig | null;
}) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [sendCopyOpen, setSendCopyOpen] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{
    title: string;
    message: string;
    secondaryLabel?: string;
    secondaryHref?: string;
  } | null>(null);

  function openInvite() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Sharing a playbook is a Team Coach feature",
        message: "Upgrade to Team Coach ($9/mo or $99/yr) to invite teammates and share playbooks.",
      });
      return;
    }
    setInviteOpen(true);
  }

  function openDuplicate() {
    // Free users can duplicate as long as their one-playbook slot is open;
    // the server runs the quota check and returns `needsUpgrade` if it isn't,
    // so we don't pre-block here. Pre-blocking on tier alone was the bug —
    // it prevented free users with an open slot from duplicating a shared
    // playbook into their account.
    setDuplicateOpen(true);
  }

  function openSendCopy() {
    if (!viewerIsCoach) {
      setUpgradeNotice({
        title: "Sending a copy is a Team Coach feature",
        message: "Upgrade to Team Coach ($9/mo or $99/yr) to share copies of your playbook.",
      });
      return;
    }
    setSendCopyOpen(true);
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
          title: "Sharing a playbook is a Team Coach feature",
          message: "Upgrade to Team Coach ($9/mo or $99/yr) to invite teammates and share playbooks.",
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
    fn: () => Promise<{ ok: boolean; error?: string; needsUpgrade?: boolean } | { ok: true; id?: string }>,
    onOk?: (r: { ok: true; id?: string }) => void,
  ) {
    fn().then((res) => {
      if (!res.ok) {
        if ("needsUpgrade" in res && res.needsUpgrade) {
          setUpgradeNotice({
            title: "Upgrade to Team Coach",
            message: ("error" in res && res.error) || "This is a Team Coach feature.",
          });
        } else {
          toast(("error" in res && res.error) || "Something went wrong.", "error");
        }
        return;
      }
      onOk?.(res as { ok: true; id?: string });
      router.refresh();
    });
  }

  function handleDuplicate(args: {
    newName: string;
    color: string;
    logoUrl: string | null;
    copyGameResults: boolean;
    copyKb: boolean;
  }) {
    setDuplicateOpen(false);
    duplicatePlaybookAction(playbookId, args.newName, {
      copyGameResults: args.copyGameResults,
      copyKb: args.copyKb,
      color: args.color,
      logoUrl: args.logoUrl,
    }).then((res) => {
      if (!res.ok) {
        if ("needsUpgrade" in res && res.needsUpgrade) {
          const existing =
            "existingOwnedPlaybook" in res ? res.existingOwnedPlaybook : null;
          setUpgradeNotice({
            title: "Your free playbook slot is taken",
            message: existing
              ? `Free accounts include one playbook — "${existing.name}". Delete it to free the spot, or upgrade to Team Coach ($9/mo or $99/yr) for unlimited playbooks.`
              : "Upgrade to Team Coach ($9/mo or $99/yr) to duplicate playbooks.",
            ...(existing
              ? {
                  secondaryLabel: "Open my playbook",
                  secondaryHref: `/playbooks/${existing.id}`,
                }
              : {}),
          });
        } else {
          toast(res.error ?? "Something went wrong.", "error");
        }
        return;
      }
      if (res.id) router.push(`/playbooks/${res.id}`);
      router.refresh();
    });
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

  function handleToggleHeroExample() {
    const next = !(exampleAdmin?.isHero ?? false);
    run(() => setPlaybookHeroExampleAction(playbookId, next));
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
          <Link
            href={homeHref}
            className={`sm:hidden inline-flex items-center justify-center -ml-1 size-9 shrink-0 rounded-lg transition-colors ${onAccent} ${onAccentHover}`}
            aria-label={isExamplePreview ? "Back to examples" : "Back to lobby"}
          >
            <ArrowLeft className="size-5" />
          </Link>
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
                Share
              </Button>
            )}
            {isExamplePreview && (
              <Link
                href={`/copy/example/${playbookId}`}
                onClick={() =>
                  track({
                    event: "example_cta_click",
                    target: "claim_example_header",
                    metadata: {
                      surface: "example_playbook_header",
                      playbook_id: playbookId,
                      action: "claim",
                    },
                  })
                }
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${
                  isLightBg
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-white text-slate-900 hover:bg-white/90"
                }`}
              >
                Make this mine
              </Link>
            )}
            {canShare && (
              <button
                type="button"
                onClick={openInvite}
                className={`sm:hidden inline-flex items-center justify-center size-9 rounded-lg transition-colors ${onAccent} ${onAccentHover}`}
                aria-label="Share playbook"
                title="Share"
              >
                <UserPlus className="size-5" />
              </button>
            )}
            {(coachAiAvailable || showCoachCalPromo) && (
              <div className="sm:hidden">
                <CoachAiLauncher
                  isAdmin={isAdmin ?? false}
                  entitled={coachAiAvailable ?? false}
                  playbookId={playbookId}
                  evalDays={coachAiEvalDays}
                />
              </div>
            )}
            {(canShare || canManage || playActions || exampleAdmin) && (
              <HeaderMenu
                playbookId={playbookId}
                homeHref={homeHref}
                onAccent={onAccent}
                onAccentHover={onAccentHover}
                lockTeamCoachItems={!viewerIsCoach}
                onInvite={canShare ? openInvite : null}
                onCustomize={canManage ? () => setCustomizeOpen(true) : null}
                onRevokeAllInvites={
                  canShare && (outstandingInviteCount ?? 0) > 0
                    ? handleRevokeAllInvites
                    : null
                }
                outstandingInviteCount={outstandingInviteCount ?? 0}
                onSendCopy={canShare ? openSendCopy : null}
                onDuplicate={
                  canManage ||
                  (canShare && (allowCoachDuplication ?? true)) ||
                  (!canShare && (allowPlayerDuplication ?? true))
                    ? openDuplicate
                    : null
                }
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
                onToggleHeroExample={
                  exampleAdmin?.isPublished || exampleAdmin?.isHero
                    ? handleToggleHeroExample
                    : null
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
          onSwitchToSendCopy={() => {
            setInviteOpen(false);
            openSendCopy();
          }}
          referralConfig={referralConfig ?? null}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {sendCopyOpen && (
        <SendCopyDialog
          playbookId={playbookId}
          playbookName={name}
          onClose={() => setSendCopyOpen(false)}
        />
      )}

      {duplicateOpen && (
        <DuplicatePlaybookDialog
          playbookId={playbookId}
          playbookName={name}
          suggestedName={suggestedDuplicateName ?? `${name} (copy)`}
          sourceColor={accentColor}
          sourceLogoUrl={logoUrl ?? null}
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
        secondaryLabel={upgradeNotice?.secondaryLabel}
        secondaryHref={upgradeNotice?.secondaryHref}
      />
    </>
  );
}

function DuplicatePlaybookDialog({
  playbookId,
  playbookName,
  suggestedName,
  sourceColor,
  sourceLogoUrl,
  allowGameResultsCopy,
  onClose,
  onDuplicate,
}: {
  playbookId: string;
  playbookName: string;
  suggestedName: string;
  sourceColor: string;
  sourceLogoUrl: string | null;
  allowGameResultsCopy: boolean;
  onClose: () => void;
  onDuplicate: (args: {
    newName: string;
    color: string;
    logoUrl: string | null;
    copyGameResults: boolean;
    copyKb: boolean;
  }) => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [color, setColor] = useState(sourceColor);
  const [logoUrl, setLogoUrl] = useState<string>(sourceLogoUrl ?? "");
  const [copyGameResults, setCopyGameResults] = useState(false);
  const [copyKb, setCopyKb] = useState(false);
  const [kbCount, setKbCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getPlaybookKbCountAction(playbookId);
      if (cancelled) return;
      setKbCount(res.ok ? res.count : 0);
    })();
    return () => { cancelled = true; };
  }, [playbookId]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onDuplicate({
      newName: trimmed,
      color,
      logoUrl: logoUrl.length > 0 ? logoUrl : null,
      copyGameResults: allowGameResultsCopy && copyGameResults,
      copyKb,
    });
  }
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
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
              placeholder={suggestedName}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
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
          <LogoPicker value={logoUrl} onChange={setLogoUrl} />
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
          {kbCount !== null && kbCount > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-inset/50 p-3">
              <input
                type="checkbox"
                checked={copyKb}
                onChange={(e) => setCopyKb(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-border"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  Also copy Coach Cal notes ({kbCount})
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Schemes, terminology, opponent notes, and other team-specific knowledge attached to this playbook&apos;s Coach Cal knowledge base.
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
    </div>
  );
}

function SendCopyDialog({
  playbookId,
  playbookName,
  onClose,
}: {
  playbookId: string;
  playbookName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"link" | "qr">("link");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCreating(true);
      const res = await createCopyLinkAction({ playbookId, expiresInDays: 30 });
      if (cancelled) return;
      setCreating(false);
      if (!res.ok) {
        toast(`Could not create copy link: ${res.error}`, "error");
        onClose();
        return;
      }
      setLinkUrl(
        tagShareUrl(`${SITE_URL}/copy/${res.token}`, {
          kind: "playbook_copy",
          channel: "copy_link",
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // playbookId is stable for the dialog's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  useEffect(() => {
    if (!linkUrl) return;
    let cancelled = false;
    QRCode.toDataURL(linkUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkUrl]);

  async function copy() {
    if (!linkUrl) return;
    track({
      event: "share_button_click",
      target: isNativeApp() ? "native_share" : "copy_link",
      metadata: { kind: "playbook_copy", playbook_id: playbookId },
    });
    if (isNativeApp()) {
      const result = await nativeShare({
        title: "Copy of my playbook",
        text: `Here's a copy of ${playbookName} on XO Gridmaker — claim your own editable version.`,
        url: linkUrl,
        dialogTitle: "Send copy link",
      });
      if (result === "shared") return;
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed — select and copy the link manually.", "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Send a copy</h2>
            <p className="mt-0.5 text-xs text-muted">
              Recipient gets their own editable copy. Yours stays untouched.
            </p>
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
          <div className="rounded-lg border border-border bg-surface-inset px-3 py-2 text-xs text-muted">
            Anyone with this link can claim a standalone copy of{" "}
            <span className="font-semibold text-foreground">{playbookName}</span>{" "}
            into their own account. They become the owner of their copy — your
            future edits won&apos;t reach them, and theirs won&apos;t reach you.
            Link expires in 30 days.
          </div>

          {linkUrl && (
            <SegmentedControl
              value={tab}
              onChange={(v) => setTab(v as "link" | "qr")}
              options={[
                { value: "link", label: "Link" },
                { value: "qr", label: "QR code" },
              ]}
            />
          )}

          {creating && (
            <div className="rounded-lg border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
              Generating link…
            </div>
          )}

          {linkUrl && tab === "link" && (
            <div className="space-y-2">
              <Input value={linkUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={copy} className="w-full" leftIcon={copied ? Check : Copy}>
                {copied ? "Copied!" : isNativeApp() ? "Share link" : "Copy link"}
              </Button>
            </div>
          )}

          {linkUrl && tab === "qr" && (
            <div className="flex flex-col items-center gap-2">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL
                <img
                  src={qrDataUrl}
                  alt="QR code for copy link"
                  className="size-56 rounded-md border border-border bg-white"
                />
              ) : (
                <div className="flex size-56 items-center justify-center rounded-md border border-border bg-surface text-xs text-muted">
                  Generating QR…
                </div>
              )}
              <p className="text-center text-xs text-muted">
                Scan to claim a copy on another device.
              </p>
            </div>
          )}
        </div>
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

/**
 * One of the three peer-level share options (send a copy / co-coach / player)
 * shown at the top of the Share dialog. Visually equal so the IA reads as
 * "pick what kind of share" rather than "invite, with send-a-copy as a
 * footnote." Send-a-copy uses the primary accent because it's the most
 * viral primitive.
 */
function ShareOptionCard({
  icon,
  title,
  description,
  accent,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "primary" | "default";
  selected?: boolean;
  onClick: () => void;
}) {
  const base = "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors";
  const variants =
    accent === "primary"
      ? "border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
      : selected
        ? "border-primary bg-primary/5"
        : "border-border bg-surface-inset hover:border-primary/40 hover:bg-primary/5";
  return (
    <button type="button" onClick={onClick} className={`${base} ${variants}`}>
      <span
        className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md ${
          accent === "primary" || selected
            ? "bg-primary/15 text-primary"
            : "bg-surface-raised text-muted"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}

function TeamCoachLockBadge() {
  return (
    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      <Lock className="size-2.5" />
      Team Coach
    </span>
  );
}

function HeaderMenu({
  playbookId,
  homeHref,
  onAccent,
  onAccentHover,
  lockTeamCoachItems,
  onInvite,
  onRevokeAllInvites,
  outstandingInviteCount,
  onSendCopy,
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
  onToggleHeroExample,
}: {
  playbookId: string;
  homeHref: string;
  onAccent: string;
  onAccentHover: string;
  /** When true, items that require Team Coach show a small lock badge. */
  lockTeamCoachItems: boolean;
  onInvite: (() => void) | null;
  onRevokeAllInvites: (() => void) | null;
  outstandingInviteCount: number;
  onSendCopy: (() => void) | null;
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
  onToggleHeroExample: (() => void) | null;
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
          {/* Home intentionally omitted — the back arrow in the header
              already navigates to the lobby/examples view. */}
          <div className="sm:hidden">
            <SectionLabel>Navigate</SectionLabel>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={menuItemCls}
            >
              <CreditCard className="size-4 shrink-0" />
              <span>Account</span>
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
                <span>Share</span>
                {lockTeamCoachItems && <TeamCoachLockBadge />}
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
              {!playActions.isViewer && playActions.newFormationHref && (
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

          {/* Share */}
          {onSendCopy && (
            <>
              <SectionDivider />
              <SectionLabel>Share</SectionLabel>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSendCopy();
                }}
                className={menuItemCls}
              >
                <Send className="size-4 shrink-0" />
                <span>Send a copy</span>
                {lockTeamCoachItems && <TeamCoachLockBadge />}
              </button>
            </>
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
                  {lockTeamCoachItems && <TeamCoachLockBadge />}
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
              <DownloadForOfflineButton
                playbookId={playbookId}
                className={menuItemCls}
                onAction={() => setOpen(false)}
              />
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
              {onToggleHeroExample && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onToggleHeroExample();
                  }}
                  className={menuItemCls}
                >
                  <Sparkles className="size-4 shrink-0" />
                  <span>
                    {exampleAdmin.isHero
                      ? "Remove as hero playbook"
                      : "Make hero playbook"}
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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
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
  onSwitchToSendCopy = null,
  referralConfig = null,
  onClose,
}: {
  playbookId: string;
  teamName: string;
  senderName: string | null;
  canManage?: boolean;
  allowCoachDuplication?: boolean;
  onToggleCoachDuplication?: (() => void) | null;
  /** Lets a coach pivot from "invite a co-coach" to "send a copy" without
   *  closing and re-finding the menu. The two flows are conceptually
   *  parallel — surfacing the choice in one dialog avoids the
   *  "wait, you can also..." moment after they've already sent an
   *  invite they didn't really want. */
  onSwitchToSendCopy?: (() => void) | null;
  /** When enabled in site settings, the Send-a-copy card surfaces a small
   *  "earn N days" promo so coaches know there's a referral reward. */
  referralConfig?: import("@/lib/site/referral-config").ReferralConfig | null;
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
  // Set when the user clicks one of the role cards (Co-coach / Player).
  // Tells the auto-generate effect below "the user already chose — skip
  // the config form and produce the QR straight away." Reset by Back so
  // the user can return to the cards or tweak settings.
  const [skipConfig, setSkipConfig] = useState(false);
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

  // After the user picks a role card, auto-create the invite so they land
  // on the QR straight away. Defaults match what almost every owner picks
  // anyway (auto-approve true, limit 25, 14-day expiry); coaches who need
  // different settings can revoke from the Roster tab. Same flow on
  // desktop and mobile — simpler than the previous mobile-only auto-jump
  // that raced the user's click.
  useEffect(() => {
    if (!skipConfig) return;
    if (mode !== "link") return;
    if (inviteUrl) return;
    if (creating) return;
    void generate();
    // generate reads role + autoApprove + autoApproveLimit from state,
    // which are stable by the time this fires (they were set or defaulted
    // before skipConfig flipped on).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipConfig, mode, inviteUrl, creating]);

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
    // Both player and coach links are reusable. Coach redemptions are
    // gated per-attempt by accept_invite's seat check so a shared link
    // can't blow past the owner's seat cap.
    const res = await createInviteAction({
      playbookId,
      role,
      expiresInDays: 14,
      maxUses: null,
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
    const url = tagShareUrl(`${SITE_URL}/invite/${res.invite.token}`, {
      kind: "playbook_invite",
      channel: "copy_link",
    });
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
    // Inside the native app, surface the OS share sheet so coaches can
    // forward the invite via iMessage/Mail/Slack with a single tap. The
    // helper falls back to clipboard if the user dismisses the sheet.
    if (isNativeApp()) {
      const result = await nativeShare({
        title: "Join my playbook",
        text: `Join my ${teamName ?? "team's"} playbook on XO Gridmaker`,
        url: inviteUrl,
        dialogTitle: "Share invite link",
      });
      if (result === "shared") return;
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    }
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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              {mode === "choose"
                ? "Share this playbook"
                : role === "editor"
                  ? "Add a co-coach"
                  : "Add a player"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {mode === "choose"
                ? "Pick how you want to share."
                : "Send a link, QR code, or email."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {seatStatus?.isCoachPlus && seatStatus.canManageSeats && (
          <Link
            href="/account"
            className="flex items-center justify-between gap-2 border-b border-border bg-surface-inset/60 px-5 py-2 text-xs text-muted hover:bg-surface-inset"
          >
            <span>
              <span className="font-semibold text-foreground">
                {seatStatus.used} of {seatStatus.total}
              </span>{" "}
              coach seat{seatStatus.total === 1 ? "" : "s"} used
            </span>
            <span className="font-medium text-primary">Manage coaches →</span>
          </Link>
        )}

        <div className="space-y-4 p-5">
          {mode === "choose" && (
            <div className="space-y-3">
              <div className="space-y-2">
                {onSwitchToSendCopy && (
                  <ShareOptionCard
                    icon={<Send className="size-4" />}
                    title="Send a copy"
                    description={
                      referralConfig?.enabled
                        ? `Give another coach a starter playbook of their own. Earn ${referralConfig.daysPerAward} days of Team Coach when a new coach claims it.`
                        : "Give another coach a starter playbook of their own. They become the owner — your playbook stays yours."
                    }
                    accent="primary"
                    onClick={onSwitchToSendCopy}
                  />
                )}
                {canManage && (
                  <ShareOptionCard
                    icon={<UserPlus className="size-4" />}
                    title="Add a co-coach"
                    description="They edit this playbook with you. Changes are shared in real time."
                    accent="default"
                    onClick={() => {
                      setRole("editor");
                      setMode("link");
                      setLinkTab("qr");
                      setSkipConfig(true);
                    }}
                  />
                )}
                <ShareOptionCard
                  icon={<UserPlus className="size-4" />}
                  title="Add a player"
                  description="View-only access to plays and notes."
                  accent="default"
                  onClick={() => {
                    setRole("viewer");
                    setMode("link");
                    setLinkTab("qr");
                    setSkipConfig(true);
                  }}
                />
                {!canManage && (
                  <p className="text-xs text-muted">
                    Only the playbook owner can grant co-coach (edit) access.
                  </p>
                )}
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
              {/* The old "by email" / "by link or QR" method-picker cards
                  used to render here for whichever role was toggled. After
                  the IA reframe, role-card clicks jump straight to QR; the
                  email path is reachable from the QR screen via "Send by
                  email instead", so these vestigial cards have been
                  removed. */}
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

          {/* The previous "configure your invite" form has been retired —
              defaults (auto-approve up to 25, valid 14 days) match what
              every owner picked anyway, and links don't have finite uses.
              When skipConfig is set, we auto-generate and show a small
              loading state in its place. The (outOfCoachSeats /
              needsCoachPlan) blocking error still surfaces here so a
              co-coach pick on a maxed-out seat pool doesn't silently
              spin. */}
          {mode === "link" && !inviteUrl && (
            <>
              {role === "editor" && (outOfCoachSeats || needsCoachPlan) ? (
                <div className="flex items-start gap-2 rounded-md bg-danger-light px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="flex-1">
                    {needsCoachPlan ? (
                      <>
                        <strong>Coaches need a Team Coach plan.</strong>{" "}
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
              ) : (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                  <svg
                    className="size-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <span>Generating QR…</span>
                </div>
              )}
            </>
          )}

          {mode === "link" && inviteUrl && (
            <>
              <div className="-mt-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("choose");
                    setInviteUrl(null);
                    setQrDataUrl(null);
                    setSkipConfig(false);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                >
                  <ArrowLeft className="size-3" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInviteUrl(null);
                    setQrDataUrl(null);
                    setSkipConfig(false);
                    setMode("email");
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Mail className="size-3" />
                  Send by email instead
                </button>
              </div>
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
    </div>
  );
}
