"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CloudDownload,
  Copy,
  FlaskConical,
  Globe,
  Link2,
  LogOut,
  Lock,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  UserPlus,
  WifiOff,
  X,
} from "lucide-react";
import { NativeUpgradeCta, useUpgradeHref } from "@/components/billing/NativeUpgradeCta";
import { track } from "@/lib/analytics/track";
import type { ExamplePromo } from "@/lib/site/example-promo-config";
import {
  archivePlaybookAction,
  createPlaybookAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  getPlaybookKbCountAction,
  leavePlaybookAction,
  setPlaybookAllowDuplicationAction,
  uploadPlaybookLogoAction,
} from "@/app/actions/playbooks";
import {
  duplicateAsExampleAction,
  setPlaybookHeroExampleAction,
  setPlaybookIsExampleAction,
  setPlaybookPublicExampleAction,
} from "@/app/actions/admin-examples";
import type { DashboardPlaybookTile, DashboardSummary } from "@/app/actions/plays";
import { pickEditableFreePlaybook } from "@/lib/billing/free-playbook";
import { ArchiveLockedDialog } from "@/components/billing/ArchiveLockedDialog";
import type { Player, Route, SportVariant, Zone } from "@/domain/play/types";
import {
  defaultSettingsForVariant,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import { PlaybookRulesForm } from "@/features/playbooks/PlaybookRulesForm";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import { SAMPLE_FAN_PREVIEWS } from "@/features/dashboard/sampleFan";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  Input,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import {
  CustomizeTeamDialog,
  InviteTeamMemberDialog,
} from "@/app/(dashboard)/playbooks/[playbookId]/PlaybookHeader";
import { HomeCalendarTab } from "@/features/calendar/HomeCalendarTab";
import { InboxTab } from "@/features/dashboard/InboxTab";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";
import type { InboxAlert } from "@/app/actions/inbox";
import type { ActivityEntry } from "@/app/actions/activity";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { useOfflineState } from "@/lib/offline/useOfflineState";
import { WelcomeCoachProDialog } from "@/features/coach-ai/WelcomeCoachProDialog";
import { TeamCoachWelcomeDialog } from "@/features/billing/TeamCoachWelcomeDialog";

const DEFAULT_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

type DashboardView = "preview" | "classic";

function usePersistedFlag(key: string): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating user preference from localStorage
      if (window.localStorage.getItem(key) === "1") setValue(true);
    } catch {}
  }, [key]);
  const update = (v: boolean) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v ? "1" : "0");
    } catch {}
  };
  return [value, update];
}

function LogoPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPlaybookLogoAction(fd);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      onChange(res.url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">
          Logo <span className="font-normal normal-case text-muted">(optional)</span>
        </label>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "upload", label: "Upload", icon: Upload },
            { value: "url", label: "URL", icon: Link2 },
          ]}
        />
      </div>

      {mode === "upload" ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Upload}
            onClick={() => fileRef.current?.click()}
            loading={uploading}
            disabled={disabled || uploading}
          >
            {value ? "Replace image" : "Choose image"}
          </Button>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
              disabled={disabled || uploading}
            >
              Remove
            </Button>
          )}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/logo.png"
          disabled={disabled}
        />
      )}
      <p className="text-xs text-muted">
        PNG, JPG, WebP, SVG, or GIF — up to 2 MB.
      </p>
    </div>
  );
}

function colorFor(tile: DashboardPlaybookTile): string {
  if (tile.color) return tile.color;
  // Stable hash → palette index so unclaimed tiles still feel distinct.
  let h = 0;
  for (let i = 0; i < tile.id.length; i++) h = (h * 31 + tile.id.charCodeAt(i)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length];
}

function PlaybookTile({
  tile,
  actions,
}: {
  tile: DashboardPlaybookTile;
  actions: ActionMenuItem[];
}) {
  const native = useIsNativeApp();
  const { isOnline, downloadedIds } = useOfflineState();
  const isDownloaded = downloadedIds.has(tile.id);
  // Only block tile access when we're in the native shell and lacking
  // signal — web users always see live content, and locked tiles already
  // have their own treatment.
  const offlineUnavailable = native && !isOnline && !isDownloaded;

  const color = colorFor(tile);
  const initials = tile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "PB";

  const locked = tile.is_locked;
  // Always the REAL playbook page — online and offline. Offline it renders
  // from the SW cache (precached at download), so there's no separate offline
  // surface. When offline + downloaded we hand a hard `<a href>` so the
  // SW-cached HTML serves cleanly without depending on an RSC round-trip.
  const href = `/playbooks/${tile.id}`;

  const inner = (
    <div className="flex h-full flex-col">
      <div
        className="flex h-20 items-center justify-center"
        style={{ backgroundColor: color }}
      >
        {tile.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tile.logo_url}
            alt=""
            className="h-14 w-14 object-contain"
          />
        ) : (
          <span className="text-2xl font-black tracking-tight text-white drop-shadow">
            {initials}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <div className="flex flex-col gap-1.5">
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
            {tile.name}
          </h3>
          <div className="flex flex-wrap items-center gap-1">
            {tile.is_example && <Badge variant="primary">Example</Badge>}
            {tile.role !== "owner" && (
              <Badge variant={tile.role === "editor" ? "primary" : "default"}>
                {tile.role === "editor" ? "Coach" : "Player"}
              </Badge>
            )}
            {native && isDownloaded && <DownloadedChip />}
          </div>
        </div>
        <p className="text-[11px] text-muted">
          {tile.season ? `${tile.season} · ` : ""}
          {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
          {tile.sport_variant && tile.sport_variant in SPORT_VARIANT_LABELS
            ? ` · ${SPORT_VARIANT_LABELS[tile.sport_variant]}`
            : ""}
        </p>
      </div>
    </div>
  );

  const isInteractive = !locked && !offlineUnavailable;

  return (
    <div className="group relative">
      <Card hover className="relative overflow-hidden p-0">
        {!isInteractive ? (
          <div className="flex h-full flex-col opacity-60">{inner}</div>
        ) : isDownloaded && native && !isOnline ? (
          // Hard nav: keeps SW-cached HTML in play and avoids an RSC fetch
          // that would fail without signal.
          <a href={href}>{inner}</a>
        ) : (
          <Link href={href}>{inner}</Link>
        )}
        {locked && <LockedOverlay />}
        {!locked && offlineUnavailable && <OfflineUnavailableOverlay />}
      </Card>
      {isInteractive && actions.length > 0 && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionMenu items={actions} />
        </div>
      )}
    </div>
  );
}

// Icon-only "this is cached for offline" marker. Uses the cloud-with-down-arrow
// glyph that iOS and Android both use for "downloaded" so the meaning carries
// even without a text label, and the chip stays narrow enough to sit alongside
// Editor/Shared on a tight card without wrapping.
function DownloadedChip() {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/95 text-white shadow-sm ring-1 ring-emerald-700/20"
      title="Downloaded for offline"
      aria-label="Downloaded for offline"
    >
      <CloudDownload className="size-3" aria-hidden />
    </span>
  );
}

function OfflineUnavailableOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white backdrop-blur-[1px]">
      <WifiOff className="size-6" />
      <p className="px-3 text-center text-xs font-semibold">Not downloaded</p>
      <p className="px-3 text-center text-[10px] text-white/80">
        Connect to view
      </p>
    </div>
  );
}

/**
 * Locked-tile overlay where the WHOLE overlay is the upgrade tap target —
 * tapping anywhere on a locked tile opens /pricing (web always; iOS only when
 * IAP is live, otherwise the overlay is inert and shows no upgrade affordance,
 * per App Store 3.1.1). Shared by the card and book tile styles.
 */
function LockedUpgradeOverlay({
  className,
  lockSize,
}: {
  className: string;
  lockSize: string;
}) {
  const upgradeHref = useUpgradeHref();
  const body = (
    <>
      <Lock className={lockSize} />
      <p className="px-3 text-center text-xs font-semibold">
        Locked — plan downgraded
      </p>
      {upgradeHref && (
        <span className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black">
          Upgrade to unlock
        </span>
      )}
    </>
  );
  return upgradeHref ? (
    <Link href={upgradeHref} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function LockedOverlay() {
  return (
    <LockedUpgradeOverlay
      className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur-[1px] transition-colors hover:bg-black/45"
      lockSize="size-7"
    />
  );
}

/**
 * Playbook rendered as a closed book at rest (front cover showing, centered
 * on a subtle "table" surface). On hover, the cover swings open to the left
 * (CSS `rotateY`) revealing a 2-page playsheet of up to 6 offensive plays.
 *
 * All animation is GPU-cheap: `transform` + `opacity` only, driven by CSS
 * `group-hover` with a custom property. No JS per frame.
 */
export function PlaybookBookTile({
  tile,
  actions,
}: {
  tile: DashboardPlaybookTile;
  actions: ActionMenuItem[];
}) {
  const native = useIsNativeApp();
  const { isOnline, downloadedIds } = useOfflineState();
  const isDownloaded = downloadedIds.has(tile.id);
  const offlineUnavailable = native && !isOnline && !isDownloaded;

  // Branch by swapping COMPONENTS, never by early-returning above hooks.
  // `isOnline` flips at runtime (the connectivity probe resolves ~1s after
  // hydration on an offline cold boot), and an early return before
  // InteractiveBookTile's hooks changed the hook count between renders —
  // React #300, which took the whole /home segment down to the error
  // boundary right when an offline coach needed it (2026-07-15).
  if (tile.is_locked) {
    return <LockedBookTile tile={tile} />;
  }
  if (offlineUnavailable) {
    return <OfflineUnavailableBookTile tile={tile} />;
  }
  return <InteractiveBookTile tile={tile} actions={actions} />;
}

function InteractiveBookTile({
  tile,
  actions,
}: {
  tile: DashboardPlaybookTile;
  actions: ActionMenuItem[];
}) {
  const native = useIsNativeApp();
  const { isOnline, downloadedIds } = useOfflineState();
  const isDownloaded = downloadedIds.has(tile.id);
  const color = colorFor(tile);
  const initials = tile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "PB";

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate to skip SSR for SVG trig that differs between server/client
    setMounted(true);
  }, []);

  const thickness = Math.min(6, Math.max(2, Math.round(tile.play_count / 4)));
  // Always fill all 12 inside-page slots. When fewer unique plays exist,
  // cycle through them and flip every other repeat so the playsheet
  // reads as a full page instead of dashed placeholders.
  const hasPreviews = tile.previews.length > 0;
  const sheetPlays: {
    play: DashboardPlaybookTile["previews"][number];
    flipped: boolean;
  }[] = hasPreviews
    ? Array.from({ length: 12 }, (_, i) => {
        const idx = i % tile.previews.length;
        const cycle = Math.floor(i / tile.previews.length);
        return { play: tile.previews[idx], flipped: cycle % 2 === 1 };
      })
    : [];
  const [hover, setHover] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mouseInsideRef = useRef(false);

  // Touch screens have no hover, so the open-on-hover animation never
  // fires meaningfully there. Skip wiring the handlers (and let a tap go
  // straight to the playbook link) — the closed cover stays as the tile.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from matchMedia
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // When the action menu closes (via click-outside or selection), if the
  // mouse has already left the tile, collapse the book too.
  useEffect(() => {
    if (menuOpen) return;
    if (!mouseInsideRef.current) {
      setHover(false);
      setShiftX(0);
    }
  }, [menuOpen]);

  // A pointerdown anywhere outside the tile collapses it. Covers modal
  // overlays (e.g. Duplicate dialog) that sit above the tile: mouseleave
  // never fires because the overlay intercepts the pointer, and without
  // this the tile stays stuck opened after the modal closes.
  //
  // Skip while the action menu is open — its items render in a portal
  // outside `wrapperRef`, so this capture-phase handler would fire first
  // and close the menu before the menu-item click ever dispatches.
  // ActionMenu manages its own outside-click dismissal.
  useEffect(() => {
    if (!hover) return;
    if (menuOpen) return;
    function onDown(e: PointerEvent) {
      const el = wrapperRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      mouseInsideRef.current = false;
      setMenuOpen(false);
      setHover(false);
      setShiftX(0);
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [hover, menuOpen]);

  function handleEnter() {
    const el = wrapperRef.current;
    if (el) {
      // The wrapper scales by SCALE about its center, then the cover
      // flips -180° about its own (already scaled) left edge. Working in
      // the final-rendered coordinate space:
      //   wrapper scaled → [cx - W/2, cx + W/2]  (W = scaled width)
      //   cover flipped  → [cx - 1.5W, cx - 0.5W]
      //   plays page     → [cx - 0.5W, cx + 0.5W]
      // So the open book occupies [cx - 1.5W, cx + 0.5W]. Slide X just
      // enough to keep that inside the viewport.
      const r = el.getBoundingClientRect();
      const SCALE = 1.35;
      const W = r.width * SCALE;
      const cx = r.left + r.width / 2;
      const openLeft = cx - 1.5 * W;
      const openRight = cx + 0.5 * W;
      const MARGIN = 16;
      let shift = 0;
      if (openLeft < MARGIN) shift = MARGIN - openLeft;
      else if (openRight > window.innerWidth - MARGIN) {
        shift = window.innerWidth - MARGIN - openRight;
      }
      setShiftX(shift);
    }
    mouseInsideRef.current = true;
    setHover(true);
  }

  function handleLeave() {
    mouseInsideRef.current = false;
    if (menuOpen) return;
    setHover(false);
    setShiftX(0);
  }

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={isTouch ? undefined : handleEnter}
      onMouseLeave={isTouch ? undefined : handleLeave}
      className="group relative z-0"
      style={{ zIndex: hover ? 20 : 0 }}
    >
      {/* Outer transform: horizontal slide-to-fit. Snaps in quickly so the
          book is already repositioned before the cover flips past the
          viewport edge. */}
      <div
        className="transition-transform duration-150 ease-out"
        style={{
          transform: hover
            ? `translate3d(${shiftX}px, 0, 0)`
            : "translate3d(0, 0, 0)",
        }}
      >
      {/* Inner transform: scale + subtle lift. Kept at 500ms so the visual
          "pop" still feels smooth. */}
      <div
        className="transition-transform duration-500 ease-out"
        style={{
          perspective: "1600px",
          transform: hover
            ? "translate3d(0, -8px, 0) scale(1.35)"
            : "translate3d(0, 0, 0) scale(1)",
        }}
      >
      <Link
        href={`/playbooks/${tile.id}`}
        className="relative block aspect-[3/4] w-full"
      >
        {/* ------------------------------------------------------------ */}
        {/* Right page — sits where the cover was; revealed on hover      */}
        {/* ------------------------------------------------------------ */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border transition-opacity duration-500 ease-out"
          style={{ opacity: hover ? 1 : 0 }}
        >
          {/* Page-edge stripes top/bottom suggesting book thickness */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-0 flex flex-col gap-[1px] py-0.5"
          >
            {Array.from({ length: thickness }).map((_, i) => (
              <div
                key={i}
                className="h-px rounded-full bg-gradient-to-r from-transparent via-border to-transparent"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 bottom-0 flex flex-col-reverse gap-[1px] py-0.5"
          >
            {Array.from({ length: thickness }).map((_, i) => (
              <div
                key={i}
                className="h-px rounded-full bg-gradient-to-r from-transparent via-border to-transparent"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
          {/* Binding shading on the left edge (against the spine) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/15 to-transparent"
          />

          <div className="flex h-full w-full p-2">
            <PlaysheetColumn
              slots={sheetPlays.slice(6, 12)}
              blanks={hasPreviews ? 0 : 6}
              mounted={mounted}
            />
          </div>

          {!hasPreviews && mounted && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
              <div className="flex flex-col items-center gap-1">
                <Plus className="size-5 opacity-60" />
                <span>No offensive plays yet</span>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Cover — swings open 180° around its left spine                */}
        {/* Front face: cover art. Back face: page 1 of plays.            */}
        {/* ------------------------------------------------------------ */}
        <div
          className="absolute inset-0 rounded-xl transition-transform duration-700"
          style={{
            transform: hover ? "rotateY(-180deg)" : "rotateY(0deg)",
            transformOrigin: "left center",
            transformStyle: "preserve-3d",
            transitionTimingFunction: "cubic-bezier(.25,.75,.35,1)",
          }}
        >
          {/* Front face — cover art */}
          <div
            className="absolute inset-0 rounded-xl shadow-elevated ring-1 ring-black/10"
            style={{
              backgroundColor: color,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            {/* Spine highlight on the left edge */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-2 rounded-l-xl bg-gradient-to-r from-black/40 to-transparent"
            />
            {/* Page-edge stripes on the right (closed edge) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-2 right-0 flex w-1 flex-col gap-[1px]"
            >
              {Array.from({ length: thickness }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-white/55"
                  style={{ opacity: 1 - i * 0.1 }}
                />
              ))}
            </div>

            <div className="flex h-full flex-col justify-between p-3 text-white sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                  Playbook
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {tile.is_example && <Badge variant="primary">Example</Badge>}
                  {tile.role !== "owner" && (
                    <Badge variant={tile.role === "editor" ? "primary" : "default"}>
                      {tile.role === "editor" ? "Coach" : "Player"}
                    </Badge>
                  )}
                  {native && isDownloaded && <DownloadedChip />}
                </div>
              </div>

              {/* min-h-0 lets the middle shrink so the bottom name/meta row
               *  stays visible inside the 3:4 aspect box on narrow widths. */}
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                {tile.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tile.logo_url}
                    alt=""
                    className="h-20 w-20 object-contain drop-shadow sm:h-28 sm:w-28 lg:h-36 lg:w-36"
                  />
                ) : (
                  <span className="text-6xl font-black tracking-tight drop-shadow sm:text-7xl lg:text-8xl">
                    {initials}
                  </span>
                )}
              </div>

              <div className="min-w-0 shrink-0">
                <h3 className="truncate text-base font-extrabold leading-tight drop-shadow-sm sm:text-lg">
                  {tile.name}
                </h3>
                <p className="mt-0.5 truncate text-[11px] font-medium text-white/80 sm:text-xs">
                  {tile.season ? `${tile.season} · ` : ""}
                  {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
                  {tile.sport_variant && tile.sport_variant in SPORT_VARIANT_LABELS
                    ? ` · ${SPORT_VARIANT_LABELS[tile.sport_variant]}`
                    : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Back face — page 1 of plays (visible once cover opens) */}
          <div
            className="absolute inset-0 overflow-hidden rounded-xl bg-surface shadow-elevated ring-1 ring-border"
            style={{
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            {/* Binding shading on the right edge (meets the spine) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black/15 to-transparent"
            />
            <div className="flex h-full w-full p-2">
              <PlaysheetColumn
                slots={sheetPlays.slice(0, 6)}
                blanks={hasPreviews ? 0 : 6}
                mounted={mounted}
              />
            </div>
          </div>
        </div>
      </Link>
      {hasPreviews && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-full right-0 z-30 flex items-center justify-center transition-opacity duration-300"
          style={{ opacity: hover ? 1 : 0 }}
        >
          <div className="rounded-full border-2 border-slate-900 bg-white px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-900 shadow-lg">
            {tile.name}
          </div>
        </div>
      )}
      </div>
      {actions.length > 0 && (
        <div
          className="absolute right-2 top-2 z-10 rounded-full bg-surface-raised shadow-sm ring-1 ring-border opacity-0 transition-opacity group-hover:opacity-100"
        >
          <ActionMenu items={actions} open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      )}
      </div>
    </div>
  );
}

function OfflineUnavailableBookTile({ tile }: { tile: DashboardPlaybookTile }) {
  const color = colorFor(tile);
  const initials =
    tile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";
  return (
    <div className="relative block aspect-[3/4] w-full">
      <div
        className="absolute inset-0 overflow-hidden rounded-xl shadow-elevated ring-1 ring-black/10 opacity-60"
        style={{ backgroundColor: color }}
      >
        <div className="flex h-full flex-col justify-between p-5 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
            Playbook
          </span>
          <div className="flex flex-1 items-center justify-center">
            {tile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tile.logo_url}
                alt=""
                className="h-36 w-36 object-contain drop-shadow"
              />
            ) : (
              <span className="text-8xl font-black tracking-tight drop-shadow">
                {initials}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold leading-tight drop-shadow-sm">
              {tile.name}
            </h3>
            <p className="mt-0.5 truncate text-xs font-medium text-white/80">
              {tile.season ? `${tile.season} · ` : ""}
              {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-black/55 text-white">
        <WifiOff className="size-7" />
        <p className="px-3 text-center text-xs font-semibold">Not downloaded</p>
        <p className="px-3 text-center text-[11px] text-white/80">
          Connect to view this playbook
        </p>
      </div>
    </div>
  );
}

function LockedBookTile({ tile }: { tile: DashboardPlaybookTile }) {
  const color = colorFor(tile);
  const initials =
    tile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";
  return (
    <div className="relative block aspect-[3/4] w-full">
      <div
        className="absolute inset-0 overflow-hidden rounded-xl shadow-elevated ring-1 ring-black/10 opacity-60"
        style={{ backgroundColor: color }}
      >
        <div className="flex h-full flex-col justify-between p-5 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
            Playbook
          </span>
          <div className="flex flex-1 items-center justify-center">
            {tile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tile.logo_url}
                alt=""
                className="h-36 w-36 object-contain drop-shadow"
              />
            ) : (
              <span className="text-8xl font-black tracking-tight drop-shadow">
                {initials}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold leading-tight drop-shadow-sm">
              {tile.name}
            </h3>
            <p className="mt-0.5 truncate text-xs font-medium text-white/80">
              {tile.season ? `${tile.season} · ` : ""}
              {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>
      <LockedUpgradeOverlay
        className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/55 text-white transition-colors hover:bg-black/50"
        lockSize="size-8"
      />
    </div>
  );
}

function PlaysheetColumn({
  slots,
  blanks,
  mounted,
}: {
  slots: {
    play: { players: Player[]; routes: Route[]; zones: Zone[]; lineOfScrimmageY: number };
    flipped: boolean;
  }[];
  blanks: number;
  mounted: boolean;
}) {
  return (
    <div className="grid flex-1 grid-cols-2 grid-rows-3 gap-1.5">
      {mounted &&
        slots.map((s, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-sm bg-white ring-1 ring-border/70"
            style={s.flipped ? { transform: "scaleX(-1)" } : undefined}
          >
            <PlayThumbnail preview={s.play} thin light />
          </div>
        ))}
      {Array.from({ length: blanks }).map((_, i) => (
        <div
          key={`blank-${i}`}
          className="rounded-sm border border-dashed border-border/70 bg-surface-inset/40"
        />
      ))}
    </div>
  );
}

function currentSeasonLabel(): string {
  const d = new Date();
  const m = d.getMonth();
  const y = d.getFullYear();
  const season =
    m <= 1 || m === 11 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return `${season} ${y}`;
}

/**
 * Shown when a coach is collaborating on others' playbooks but hasn't built
 * their own yet. Frames creation positively — collaborating and owning are
 * independent on the free tier (a free coach can do both).
 */
function CollaboratorOnlyBanner({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Like what you&rsquo;re seeing? Build your own playbook — free.
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            You can create your own playbook with up to 16 plays at no cost,
            and keep collaborating on the ones above.
          </p>
        </div>
        <div className="self-end sm:self-auto">
          <Button variant="primary" size="sm" leftIcon={Plus} onClick={onCreate}>
            Build my playbook
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Marketing tile shown when a coach has no playbooks yet. Looks like a real
 * PlaybookBookTile (opens on hover), but it's fake — samples preview plays,
 * a generic lion logo, and clicking opens the Create Playbook dialog.
 */
/**
 * New-user empty state: the "start fresh" playbook tile plus a path into the
 * example playbooks. The example CTA's prominence is admin-controlled via
 * `examplePromo` (off = subtle link, everyone/AB-treatment = a prominent
 * bordered CTA). Fires an exposure event on mount (so the A/B lift is
 * measurable) and a click event on either affordance.
 */
function EmptyStateStart({
  examplePromo,
  onCreate,
}: {
  examplePromo: ExamplePromo;
  onCreate: () => void;
}) {
  useEffect(() => {
    if (examplePromo.variant !== "none") {
      track({
        event: "example_promo_exposed",
        target: "home_empty",
        metadata: { variant: examplePromo.variant, mode: examplePromo.mode },
      });
    }
  }, [examplePromo.variant, examplePromo.mode]);

  const onCtaClick = () => {
    if (examplePromo.variant !== "none") {
      track({
        event: "example_promo_cta_click",
        target: "home_empty",
        metadata: { variant: examplePromo.variant },
      });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 pt-4">
      <div className="w-60 sm:w-64">
        <MarketingPlaybookTile onCreate={onCreate} />
      </div>
      {examplePromo.show ? (
        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="text-xs text-muted">Not sure where to start?</p>
          <Link
            href="/examples"
            onClick={onCtaClick}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-primary/25 bg-primary/5 px-5 py-3 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-primary/10"
          >
            <Sparkles className="size-4" />
            Start from an example playbook
          </Link>
        </div>
      ) : (
        <Link
          href="/examples"
          onClick={onCtaClick}
          className="text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Or browse example playbooks →
        </Link>
      )}
    </div>
  );
}

function MarketingPlaybookTile({ onCreate }: { onCreate: () => void }) {
  const color = "#B91C1C"; // Chiefs-ish red
  const thickness = 4;
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate to skip SSR for SVG trig that differs between server/client
    setMounted(true);
  }, []);
  const season = currentSeasonLabel();

  // Repeat the sample fan so each page has 6 thumbs, wrapped in the
  // { play, flipped } slot shape PlaysheetColumn expects.
  const sheetPlays = [
    ...SAMPLE_FAN_PREVIEWS,
    ...SAMPLE_FAN_PREVIEWS,
    ...SAMPLE_FAN_PREVIEWS,
  ]
    .slice(0, 12)
    .map((p, i) => ({
      play: {
        players: p.players,
        routes: p.routes,
        zones: p.zones ?? [],
        lineOfScrimmageY: p.lineOfScrimmageY,
      },
      flipped: i % 2 === 1,
    }));

  const grayWrap = "opacity-70 [&_svg]:grayscale";

  return (
    <button
      type="button"
      onClick={onCreate}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label="Create your first playbook"
      className={`relative z-0 block w-full cursor-pointer text-left transition-transform duration-500 ease-out ${
        hover ? "z-20 -translate-y-2 translate-x-[50%] scale-[1.15]" : ""
      }`}
      style={{ perspective: "1800px" }}
    >
      <div className="relative block aspect-[3/4] w-full">
        {/* Right page — reveals where cover was */}
        <div
          className={`absolute inset-0 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border transition-opacity duration-500 ease-out ${grayWrap}`}
          style={{ opacity: hover ? 1 : 0 }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/15 to-transparent"
          />
          <div className="flex h-full w-full p-2">
            <PlaysheetColumn
              slots={sheetPlays.slice(6, 12)}
              blanks={0}
              mounted={mounted}
            />
          </div>
        </div>

        {/* Cover — rotates -180° around left spine */}
        <div
          className="absolute inset-0 rounded-xl transition-transform duration-700"
          style={{
            transform: hover ? "rotateY(-180deg)" : "rotateY(0deg)",
            transformOrigin: "left center",
            transformStyle: "preserve-3d",
            transitionTimingFunction: "cubic-bezier(.25,.75,.35,1)",
          }}
        >
          {/* Front face */}
          <div
            className="absolute inset-0 rounded-xl shadow-elevated ring-1 ring-black/10"
            style={{
              backgroundColor: color,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-2 rounded-l-xl bg-gradient-to-r from-black/40 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-2 right-0 flex w-1 flex-col gap-[1px]"
            >
              {Array.from({ length: thickness }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-white/55"
                  style={{ opacity: 1 - i * 0.1 }}
                />
              ))}
            </div>

            <div className="flex h-full flex-col justify-between p-5 text-white">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                Playbook
              </span>
              <div
                className="flex flex-1 items-center justify-center"
                aria-hidden
              >
                <svg
                  viewBox="0 0 100 120"
                  className="h-36 w-36 drop-shadow-lg"
                >
                  <path
                    d="M50 6 L92 22 V58 Q92 94 50 114 Q8 94 8 58 V22 Z"
                    fill="#fff"
                    stroke="rgba(0,0,0,0.18)"
                    strokeWidth="2"
                  />
                  <polygon
                    points="50,28 58,50 81,50 62,64 70,87 50,73 30,87 38,64 19,50 42,50"
                    fill={color}
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-extrabold leading-tight drop-shadow-sm">
                  Your New Playbook
                </h3>
                <p className="mt-0.5 truncate text-xs font-medium text-white/80">
                  {season}
                </p>
              </div>
            </div>
          </div>

          {/* Back face — page 1 of sample plays, grayed */}
          <div
            className={`absolute inset-0 overflow-hidden rounded-xl bg-surface shadow-elevated ring-1 ring-border ${grayWrap}`}
            style={{
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black/15 to-transparent"
            />
            <div className="flex h-full w-full p-2">
              <PlaysheetColumn
                slots={sheetPlays.slice(0, 6)}
                blanks={0}
                mounted={mounted}
              />
            </div>
          </div>
        </div>

        {/* CTA overlay — centered over the open book, appears on hover */}
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity ease-out"
          style={{
            opacity: hover ? 1 : 0,
            transitionDuration: "200ms",
            transitionDelay: hover ? "200ms" : "0ms",
          }}
          aria-hidden
        >
          <div
            className="rounded-xl bg-surface-raised px-5 py-3 text-center shadow-elevated ring-1 ring-border"
            style={{ transform: "translateX(-50%)" }}
          >
            <p className="text-sm font-bold text-foreground">
              Click here to start creating your playbook
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function NewPlaybookTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[140px] flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-inset/40 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <div className="flex h-20 items-center justify-center bg-surface-inset/60 group-hover:bg-primary/10">
        <Plus className="size-7 text-muted group-hover:text-primary" strokeWidth={1.5} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <h3 className="truncate text-sm font-bold text-muted group-hover:text-primary">
          New Playbook
        </h3>
        <p className="text-[11px] text-muted">Click to create</p>
      </div>
    </button>
  );
}

export function DashboardClient({
  data,
  hideAnimation = false,
  isAdmin = false,
  teamCalendarAvailable = false,
  canUseTeamFeatures = false,
  inboxAlerts = [],
  activityEntries = [],
  initialTab = "playbooks",
  examplePromo = { show: false, variant: "none", mode: "off" },
  coachAiAvailable = false,
  showCoachCalPromo = false,
  showCoachProWelcome = false,
  showTeamCoachWelcome = false,
}: {
  data: DashboardSummary;
  hideAnimation?: boolean;
  isAdmin?: boolean;
  teamCalendarAvailable?: boolean;
  canUseTeamFeatures?: boolean;
  inboxAlerts?: InboxAlert[];
  activityEntries?: ActivityEntry[];
  initialTab?: HomeTab;
  examplePromo?: ExamplePromo;
  coachAiAvailable?: boolean;
  showCoachCalPromo?: boolean;
  /**
   * True when the user just landed via the upgrade-success redirect
   * (`/home?welcome=coach_pro`) AND the server confirmed their
   * entitlement is actually `coach_ai`. Renders the WelcomeCoachPro
   * celebration dialog — single-fire, the dialog strips the URL param
   * on mount so refresh / back-nav can't replay it.
   */
  showCoachProWelcome?: boolean;
  /**
   * Same shape as showCoachProWelcome but for first-time Team Coach
   * subscribers. Renders the TeamCoachWelcomeDialog instead — same
   * sparkle + checklist + starter cards pattern, but the starter
   * cards route to non-AI actions (create playbook, invite assistant,
   * set up calendar) since Team Coach doesn't include Cal.
   */
  showTeamCoachWelcome?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  // No `?tab=` → Playbooks. Falling back to a remembered `initialTab` here
  // was the source of a "Playbooks tab does nothing" bug: arriving at
  // /home?tab=inbox locked initialTab to "inbox", and clicking Playbooks
  // (which clears the param) would snap back to Inbox.
  const homeTab: HomeTab =
    tabParam === "activity"
      ? "inbox"
      : tabParam === "calendar" ||
          tabParam === "inbox" ||
          tabParam === "playbooks"
        ? tabParam
        : "playbooks";
  const setHomeTab = useCallback(
    (t: HomeTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (t === "playbooks") params.delete("tab");
      else params.set("tab", t);
      const qs = params.toString();
      window.history.replaceState({}, "", qs ? `/home?${qs}` : "/home");
    },
    [searchParams],
  );
  // Badge count + urgency come from InboxBadgeContext so the desktop tab
  // nav reacts the moment the coach archives/deletes/RSVPs an alert,
  // instead of waiting on the layout's router.refresh() round-trip.
  // The server-rendered baseline is hydrated from the parent layout
  // (which calls listInboxAlertsAction itself); inboxAlerts here still
  // drives the in-tab alert list, just not the badge.
  const { count: inboxCount, urgent: inboxUrgent } = useInboxBadge();
  const activityCount = activityEntries.length;
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{
    title: React.ReactNode;
    message: React.ReactNode;
    secondaryLabel?: string;
    secondaryHref?: string;
  } | null>(null);
  // The playbook a free coach just tried to archive. Archiving is a Team
  // Coach feature, so instead of failing we offer delete-or-keep.
  const [archiveGate, setArchiveGate] = useState<DashboardPlaybookTile | null>(
    null,
  );
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowCreate(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("create");
      const qs = params.toString();
      window.history.replaceState({}, "", qs ? `/home?${qs}` : "/home");
    }
  }, [searchParams]);
  const [duplicating, setDuplicating] = useState<DashboardPlaybookTile | null>(null);
  const [customizing, setCustomizing] = useState<DashboardPlaybookTile | null>(null);
  const [inviting, setInviting] = useState<DashboardPlaybookTile | null>(null);
  // Tiles the coach just confirmed deletion on. We hide them locally
  // before the server action returns so the grid reacts instantly — the
  // tile reappears if the delete fails.
  const [optimisticallyRemovedIds, setOptimisticallyRemovedIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // Book covers everywhere. The site-admin "hide_lobby_animation" toggle
  // still falls back to flat tiles for low-end-device cohorts; otherwise
  // we always render the cover treatment. Per-tile touch detection inside
  // PlaybookBookTile keeps the cover static (no hover animation) on
  // phones and tablets without dropping the visual.
  const view: DashboardView = hideAnimation ? "classic" : "preview";
  const [showArchived, setShowArchived] = usePersistedFlag(
    "dashboard.showArchived",
  );
  const [showExamples, setShowExamples] = usePersistedFlag(
    "dashboard.showExamples",
  );

  const visiblePlaybooks =
    optimisticallyRemovedIds.size > 0
      ? data.playbooks.filter((b) => !optimisticallyRemovedIds.has(b.id))
      : data.playbooks;
  const ownedAll = visiblePlaybooks.filter((b) => b.role === "owner" && !b.is_default);
  const sharedAll = visiblePlaybooks.filter((b) => b.role !== "owner");
  // Example playbooks are pulled out of the main grid so the admin's
  // real work isn't mixed with marketing copies. They only show when
  // the admin toggles "Show marketing examples".
  const examples = [...ownedAll, ...sharedAll].filter(
    (b) => b.is_example && !b.is_archived,
  );
  // Locked tiles (plan-downgraded) sort to the end of each section so the
  // coach sees their accessible playbooks first.
  const lockedLast = (a: DashboardPlaybookTile, b: DashboardPlaybookTile) =>
    Number(a.is_locked ?? false) - Number(b.is_locked ?? false);
  const owned = ownedAll
    .filter((b) => !b.is_archived && !b.is_example)
    .sort(lockedLast);
  const shared = sharedAll
    .filter((b) => !b.is_archived && !b.is_example)
    .sort(lockedLast);
  const archived = [...ownedAll, ...sharedAll].filter((b) => b.is_archived);
  const isEmpty =
    owned.length === 0 &&
    shared.length === 0 &&
    archived.length === 0 &&
    examples.length === 0;

  function refresh() {
    router.refresh();
  }

  function handle<T>(
    fn: () => Promise<T>,
    onOk?: (result: T) => void,
    errLabel = "Something went wrong.",
  ) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && typeof res === "object" && "ok" in res) {
          const r = res as { ok: boolean; error?: string };
          if (!r.ok) {
            if (r.error && /Coach feature|Upgrade to unlock|Free tier/i.test(r.error)) {
              // Title kept neutral so we don't surface upsell language on
              // native. `errorWebSuffix` (if present) is the upsell tail
              // wrapped in `data-web-only` — visible on web, hidden on
              // iOS/Android per App Store 3.1.3(b).
              const suffix =
                (r as { errorWebSuffix?: string }).errorWebSuffix ?? undefined;
              setUpgradeNotice({
                title: "Team Coach feature",
                message: (
                  <>
                    {r.error}
                    {suffix ? (
                      <>
                        {" "}
                        <span data-web-only>{suffix}</span>
                      </>
                    ) : null}{" "}
                    <span data-native-only>
                      <NativeUpgradeCta label="Upgrade to Team Coach" fallback="Plan changes aren't available in this app." />
                    </span>
                  </>
                ),
              });
            } else {
              toast(r.error ?? errLabel, "error");
            }
            return;
          }
        }
        onOk?.(res);
        refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : errLabel, "error");
      }
    });
  }

  function deletePlaybookOptimistic(tile: DashboardPlaybookTile) {
    setOptimisticallyRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(tile.id);
      return next;
    });
    const restore = () =>
      setOptimisticallyRemovedIds((prev) => {
        if (!prev.has(tile.id)) return prev;
        const next = new Set(prev);
        next.delete(tile.id);
        return next;
      });
    startTransition(async () => {
      try {
        const res = await deletePlaybookAction(tile.id);
        if (!res.ok) {
          restore();
          toast(res.error ?? "Couldn't delete playbook.", "error");
          return;
        }
        refresh();
      } catch (e) {
        restore();
        toast(
          e instanceof Error ? e.message : "Couldn't delete playbook.",
          "error",
        );
      }
    });
  }

  function createBook(config: {
    name: string;
    variant: SportVariant;
    color: string | null;
    logo_url: string | null;
    customOffenseCount: number | null;
    season: string | null;
    settings: PlaybookSettings;
  }) {
    startTransition(async () => {
      const res = await createPlaybookAction(
        config.name,
        config.variant,
        { color: config.color, logo_url: config.logo_url },
        config.customOffenseCount,
        config.season,
        config.settings,
      );
      if (!res.ok) {
        if (/Free tier is limited/i.test(res.error)) {
          setShowCreate(false);
          // If they already own a playbook, point them back to it instead
          // of leaving the upgrade modal as a dead-end. Free users get one
          // playbook — claimed examples and self-created ones share that
          // slot, and the existing one is fully editable. Pick the *editable*
          // one (the un-locked tile), not ownedAll[0]: tiles arrive sorted by
          // updated_at desc, so the playbook they just touched floats to the
          // front even when it's a locked extra beyond the free cap.
          const existing = pickEditableFreePlaybook(ownedAll);
          // Upgrade phrasing wrapped in `<span data-web-only>` so the
          // sentence collapses to the blocker-only version on native shells
          // (App Store 3.1.3(b) compliance).
          setUpgradeNotice({
            title: "You already have your free playbook",
            message: existing ? (
              <>
                Free accounts include one playbook — &ldquo;{existing.name}&rdquo;.
                Open it to add or edit plays
                <span data-web-only>
                  , or upgrade to Team Coach ($9/mo or $99/yr) for unlimited
                  playbooks
                </span>
                .{" "}
                <span data-native-only>
                  <NativeUpgradeCta label="Upgrade to Team Coach" fallback="Plan changes aren't available in this app." />
                </span>
              </>
            ) : (
              <>
                You&rsquo;re on the free plan, which includes one playbook.
                <span data-web-only>
                  {" "}
                  Upgrade to Team Coach ($9/mo or $99/yr) to create unlimited
                  playbooks. Your existing content stays where it is.
                </span>{" "}
                <span data-native-only>
                  <NativeUpgradeCta label="Upgrade to Team Coach" fallback="Plan changes aren't available in this app." />
                </span>
              </>
            ),
            secondaryLabel: existing ? "Open my playbook" : undefined,
            secondaryHref: existing ? `/playbooks/${existing.id}` : undefined,
          });
        } else {
          toast(res.error, "error");
        }
        return;
      }
      setShowCreate(false);
      router.push(`/playbooks/${res.id}`);
    });
  }

  function confirmAnd(msg: string, fn: () => void) {
    if (window.confirm(msg)) fn();
  }

  function DupStatePill({ allowed }: { allowed: boolean }) {
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
          allowed
            ? "bg-success-light text-success"
            : "bg-surface-inset text-muted"
        }`}
      >
        {allowed ? "On" : "Off"}
      </span>
    );
  }

  function buildExampleAdminItems(tile: DashboardPlaybookTile): ActionMenuItem[] {
    if (!isAdmin) return [];
    if (!tile.is_example) {
      // On a normal playbook, "Use as example" forks into a separate copy
      // the admin owns so further edits to the source don't leak into the
      // published example. We navigate into the copy on success.
      return [
        {
          label: "Use as example",
          icon: FlaskConical,
          onSelect: () =>
            handle(
              () => duplicateAsExampleAction(tile.id),
              (res) => {
                if (res && typeof res === "object" && "id" in res && res.id) {
                  router.push(`/playbooks/${res.id}`);
                }
              },
            ),
        },
      ];
    }
    const items: ActionMenuItem[] = [
      {
        label: "Remove as example",
        icon: FlaskConical,
        onSelect: () =>
          handle(() => setPlaybookIsExampleAction(tile.id, false)),
      },
      {
        label: tile.is_public_example ? "Unpublish example" : "Publish example",
        icon: Globe,
        onSelect: () =>
          handle(() =>
            setPlaybookPublicExampleAction(tile.id, !tile.is_public_example),
          ),
      },
    ];
    // Hero promotion is downstream of "published example" — only offer the
    // toggle once the playbook is publicly visible. The unique partial index
    // on is_hero_marketing_example caps total heroes at one site-wide; the
    // server action clears any existing hero before setting a new one.
    if (tile.is_public_example || tile.is_hero_marketing_example) {
      items.push({
        label: tile.is_hero_marketing_example
          ? "Remove as hero playbook"
          : "Make hero playbook",
        icon: Sparkles,
        onSelect: () =>
          handle(() =>
            setPlaybookHeroExampleAction(
              tile.id,
              !tile.is_hero_marketing_example,
            ),
          ),
      });
    }
    return items;
  }

  function buildOwnerActions(tile: DashboardPlaybookTile): ActionMenuItem[] {
    if (tile.is_locked) {
      return [
        {
          label: "Delete",
          icon: Trash2,
          danger: true,
          onSelect: () =>
            confirmAnd(
              `Delete "${tile.name}" and all its plays? This can't be undone.`,
              () => deletePlaybookOptimistic(tile),
            ),
        },
      ];
    }
    return [
      {
        label: "Invite",
        icon: UserPlus,
        onSelect: () => setInviting(tile),
      },
      {
        label: "Customize",
        icon: Settings2,
        onSelect: () => setCustomizing(tile),
      },
      {
        label: "Duplicate",
        icon: Copy,
        onSelect: () => setDuplicating(tile),
      },
      {
        label: "Coach duplication",
        icon: tile.allow_coach_duplication ? Unlock : Lock,
        trailing: <DupStatePill allowed={tile.allow_coach_duplication} />,
        onSelect: () =>
          handle(() =>
            setPlaybookAllowDuplicationAction(
              tile.id,
              "coach",
              !tile.allow_coach_duplication,
            ),
          ),
      },
      {
        label: "Player duplication",
        icon: tile.allow_player_duplication ? Unlock : Lock,
        trailing: <DupStatePill allowed={tile.allow_player_duplication} />,
        onSelect: () =>
          handle(() =>
            setPlaybookAllowDuplicationAction(
              tile.id,
              "player",
              !tile.allow_player_duplication,
            ),
          ),
      },
      ...buildExampleAdminItems(tile),
      tile.is_archived
        ? {
            label: "Unarchive",
            icon: ArchiveRestore,
            onSelect: () =>
              handle(() => archivePlaybookAction(tile.id, false)),
          }
        : {
            label: "Archive",
            icon: Archive,
            // Archiving is a Team Coach feature. Free coaches get the
            // delete-or-keep dialog (an archived book still eats their one
            // free slot); the server enforces the same gate as a backstop.
            onSelect: () =>
              canUseTeamFeatures
                ? handle(() => archivePlaybookAction(tile.id, true))
                : setArchiveGate(tile),
          },
      {
        label: "Delete",
        icon: Trash2,
        danger: true,
        onSelect: () =>
          confirmAnd(
            `Delete "${tile.name}" and all its plays? This can't be undone.`,
            () => deletePlaybookOptimistic(tile),
          ),
      },
    ];
  }

  function buildSharedActions(tile: DashboardPlaybookTile): ActionMenuItem[] {
    const items: ActionMenuItem[] = [];
    if (tile.role === "editor") {
      items.push({
        label: "Invite",
        icon: UserPlus,
        onSelect: () => setInviting(tile),
      });
    }
    const duplicationAllowed =
      tile.role === "editor"
        ? tile.allow_coach_duplication
        : tile.allow_player_duplication;
    if (duplicationAllowed) {
      items.push({
        label: "Duplicate",
        icon: Copy,
        onSelect: () => setDuplicating(tile),
      });
    }
    if (tile.role === "editor") {
      items.push(...buildExampleAdminItems(tile));
    }
    items.push({
      label: "Unsubscribe",
      icon: LogOut,
      danger: true,
      onSelect: () =>
        confirmAnd(
          `Remove "${tile.name}" from your dashboard? The owner can re-share it later.`,
          () => handle(() => leavePlaybookAction(tile.id)),
        ),
    });
    return items;
  }

  const showTabNav =
    teamCalendarAvailable || inboxCount > 0 || activityCount > 0;

  return (
    <div className={pending ? "cursor-wait" : undefined}>
      {/* First-mount celebration for a freshly-upgraded Coach Pro user.
          Server validated `?welcome=coach_pro` against actual entitlement
          before passing showCoachProWelcome=true (anti-spoof). The
          dialog strips the URL param itself so refresh / back-nav can't
          replay it. */}
      {showCoachProWelcome && <WelcomeCoachProDialog />}
      {/* Same pattern for first-time Team Coach subscribers. */}
      {showTeamCoachWelcome && <TeamCoachWelcomeDialog />}

      {showTabNav && (
        <div className="hidden sm:block">
          <HomeTabNav
            tab={homeTab}
            onChange={setHomeTab}
            inboxCount={inboxCount}
            inboxUrgent={inboxUrgent}
            showCalendar={teamCalendarAvailable}
          />
        </div>
      )}

      {teamCalendarAvailable && (
        <div hidden={homeTab !== "calendar"} className="mt-4">
          <HomeCalendarTab />
        </div>
      )}

      <div hidden={homeTab !== "inbox"} className="mt-4">
        <InboxTab
          initialAlerts={inboxAlerts}
          initialActivity={activityEntries}
          isSiteAdmin={isAdmin}
        />
      </div>

      <div hidden={homeTab !== "playbooks"} className="mt-4 space-y-8">
        {pending && (
        <div
          className="pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-surface shadow-elevated"
          role="status"
          aria-live="polite"
        >
          <svg
            className="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="3"
              strokeOpacity="0.25"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          Saving…
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Your playbooks
          </h1>
          <p className="mt-1 text-sm text-muted">
            Pick a playbook to edit plays, add notes, or share with your team.
          </p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-3">
            {archived.length > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-foreground">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Show archived
              </label>
            )}
            {isAdmin && examples.length > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-foreground">
                <input
                  type="checkbox"
                  checked={showExamples}
                  onChange={(e) => setShowExamples(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Show marketing examples
              </label>
            )}
            <Link
              href="/examples"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-raised px-3 text-xs font-semibold text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-surface-inset"
            >
              Browse examples
            </Link>
            <Button
              variant="primary"
              size="sm"
              leftIcon={Plus}
              onClick={() => setShowCreate(true)}
            >
              New Playbook
            </Button>
          </div>
        )}
      </div>

      {!isEmpty && owned.length === 0 && shared.length > 0 && (
        <CollaboratorOnlyBanner onCreate={() => setShowCreate(true)} />
      )}

      {isEmpty ? (
        <EmptyStateStart
          examplePromo={examplePromo}
          onCreate={() => setShowCreate(true)}
        />
      ) : view === "preview" ? (
        <section className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            {owned.map((b) => (
              <PlaybookBookTile key={b.id} tile={b} actions={buildOwnerActions(b)} />
            ))}
            {shared.map((b) => (
              <PlaybookBookTile key={b.id} tile={b} actions={buildSharedActions(b)} />
            ))}
          </div>
          {showArchived && archived.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Archived · {archived.length}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3 opacity-70 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {archived.map((b) => (
                  <PlaybookBookTile
                    key={b.id}
                    tile={b}
                    actions={
                      b.role === "owner"
                        ? buildOwnerActions(b)
                        : buildSharedActions(b)
                    }
                  />
                ))}
              </div>
            </>
          )}
          {isAdmin && showExamples && examples.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Marketing examples · {examples.length}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {examples.map((b) => (
                  <PlaybookBookTile
                    key={b.id}
                    tile={b}
                    actions={
                      b.role === "owner"
                        ? buildOwnerActions(b)
                        : buildSharedActions(b)
                    }
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            <NewPlaybookTile onClick={() => setShowCreate(true)} />
            {owned.map((b) => (
              <PlaybookTile
                key={b.id}
                tile={b}
                actions={buildOwnerActions(b)}
              />
            ))}
            {shared.map((b) => (
              <PlaybookTile key={b.id} tile={b} actions={buildSharedActions(b)} />
            ))}
          </div>
          {showArchived && archived.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Archived · {archived.length}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3 opacity-70 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {archived.map((b) => (
                  <PlaybookTile
                    key={b.id}
                    tile={b}
                    actions={
                      b.role === "owner"
                        ? buildOwnerActions(b)
                        : buildSharedActions(b)
                    }
                  />
                ))}
              </div>
            </>
          )}
          {isAdmin && showExamples && examples.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Marketing examples · {examples.length}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {examples.map((b) => (
                  <PlaybookTile
                    key={b.id}
                    tile={b}
                    actions={
                      b.role === "owner"
                        ? buildOwnerActions(b)
                        : buildSharedActions(b)
                    }
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {duplicating && (
        <DuplicatePlaybookDialog
          tile={duplicating}
          pending={pending}
          onClose={() => {
            if (pending) return;
            setDuplicating(null);
          }}
          onDuplicate={(name, dupOpts) => {
            const tileId = duplicating.id;
            startTransition(async () => {
              const res = await duplicatePlaybookAction(tileId, name, {
                copyKb: dupOpts.copyKb,
              });
              if (!res.ok) {
                if ("needsUpgrade" in res && res.needsUpgrade) {
                  setDuplicating(null);
                  const existing =
                    ("existingOwnedPlaybook" in res &&
                      res.existingOwnedPlaybook) ||
                    pickEditableFreePlaybook(ownedAll) ||
                    null;
                  setUpgradeNotice({
                    title: "Your free playbook slot is taken",
                    message: existing ? (
                      <>
                        Free accounts include one playbook —{" "}
                        &ldquo;{existing.name}&rdquo;. Delete it to free the spot
                        <span data-web-only>
                          , or upgrade to Team Coach ($9/mo or $99/yr) for
                          unlimited playbooks
                        </span>
                        .{" "}
                        <span data-native-only>
                          <NativeUpgradeCta label="Upgrade to Team Coach" fallback="Plan changes aren't available in this app." />
                        </span>
                      </>
                    ) : (
                      <>
                        Free accounts include one playbook.
                        <span data-web-only>
                          {" "}
                          Upgrade to Team Coach ($9/mo or $99/yr) to duplicate
                          playbooks.
                        </span>{" "}
                        <span data-native-only>
                          <NativeUpgradeCta label="Upgrade to Team Coach" fallback="Plan changes aren't available in this app." />
                        </span>
                      </>
                    ),
                    secondaryLabel: existing ? "Open my playbook" : undefined,
                    secondaryHref: existing
                      ? `/playbooks/${existing.id}`
                      : undefined,
                  });
                } else {
                  toast(res.error ?? "Something went wrong.", "error");
                }
                return;
              }
              setDuplicating(null);
              toast("Playbook duplicated", "success");
              refresh();
            });
          }}
        />
      )}

      {showCreate && (
        <CreatePlaybookDialog
          pending={pending}
          onClose={() => setShowCreate(false)}
          onCreate={(config) => createBook(config)}
        />
      )}

      {customizing && (
        <CustomizeTeamDialog
          playbookId={customizing.id}
          initialName={customizing.name}
          initialSeason={customizing.season ?? ""}
          initialLogoUrl={customizing.logo_url ?? ""}
          initialColor={customizing.color ?? colorFor(customizing)}
          initialSettings={customizing.settings}
          variant={customizing.sport_variant}
          onClose={() => setCustomizing(null)}
        />
      )}

      {inviting && (
        <InviteTeamMemberDialog
          playbookId={inviting.id}
          teamName={inviting.name}
          senderName={data.senderName ?? null}
          canManage={inviting.role === "owner"}
          onClose={() => setInviting(null)}
        />
      )}

      <UpgradeModal
        open={upgradeNotice !== null}
        onClose={() => setUpgradeNotice(null)}
        title={upgradeNotice?.title ?? ""}
        message={upgradeNotice?.message ?? ""}
        secondaryLabel={upgradeNotice?.secondaryLabel}
        secondaryHref={upgradeNotice?.secondaryHref}
      />
      <ArchiveLockedDialog
        open={archiveGate !== null}
        playbookName={archiveGate?.name ?? ""}
        onClose={() => setArchiveGate(null)}
        onDelete={() => {
          const tile = archiveGate;
          setArchiveGate(null);
          if (tile) deletePlaybookOptimistic(tile);
        }}
      />
      </div>

      {/* Mobile-only bottom nav: lobby tabs + center Cal FAB. The
          existing top HomeTabNav above is hidden on mobile; this is the
          primary mobile navigation surface. */}
      {/* HomeBottomNav now lives in (dashboard)/layout.tsx so it
          persists across page navigations within the dashboard
          (no flicker when going from /home → /account, etc.). */}
    </div>
  );
}

const SPORT_OPTIONS: { value: SportVariant; label: string }[] = [
  { value: "flag_5v5", label: SPORT_VARIANT_LABELS.flag_5v5 },
  { value: "flag_6v6", label: SPORT_VARIANT_LABELS.flag_6v6 },
  { value: "flag_7v7", label: SPORT_VARIANT_LABELS.flag_7v7 },
  { value: "tackle_11", label: SPORT_VARIANT_LABELS.tackle_11 },
  { value: "other", label: SPORT_VARIANT_LABELS.other },
];

function CreatePlaybookDialog({
  pending,
  onClose,
  onCreate,
}: {
  pending: boolean;
  onClose: () => void;
  onCreate: (config: {
    name: string;
    variant: SportVariant;
    color: string | null;
    logo_url: string | null;
    customOffenseCount: number | null;
    season: string | null;
    settings: PlaybookSettings;
  }) => void;
}) {
  const [view, setView] = useState<"basics" | "rules">("basics");
  const [name, setName] = useState("");
  const [variant, setVariant] = useState<SportVariant>("flag_7v7");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [logoUrl, setLogoUrl] = useState("");
  const [season, setSeason] = useState("");
  const [settings, setSettings] = useState<PlaybookSettings>(() =>
    defaultSettingsForVariant("flag_7v7"),
  );
  const touchedSettingsRef = useRef(false);

  // Sync settings to variant defaults until the user edits them directly.
  useEffect(() => {
    if (touchedSettingsRef.current) return;
    setSettings(defaultSettingsForVariant(variant, null));
  }, [variant]);

  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      name: trimmed,
      variant,
      color,
      logo_url: logoUrl.trim() || null,
      customOffenseCount: variant === "other" ? settings.maxPlayers : null,
      season: season.trim() || null,
      settings,
    });
  }

  const summary = rulesSummary(settings);

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
        <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface-raised shadow-elevated">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {view === "rules" && (
              <button
                type="button"
                onClick={() => setView("basics")}
                className="-ml-1 rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <h2 className="flex-1 text-base font-bold text-foreground">
              {view === "basics" ? "New Playbook" : "Game rules"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Body */}
          {view === "basics" ? (
            <div
              key="basics"
              className="space-y-5 overflow-y-auto p-5 duration-200 animate-in fade-in slide-in-from-left-2"
            >
              {/* Name + tile preview */}
              <div className="flex items-start gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: color }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-10 w-10 object-contain" />
                  ) : (
                    <span className="text-lg font-black tracking-tight text-white drop-shadow">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    Name
                  </label>
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit();
                    }}
                    placeholder="e.g. Varsity 2026"
                  />
                </div>
              </div>

              {/* Season */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  Season <span className="font-normal normal-case text-muted-light">(optional)</span>
                </label>
                <Input
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder="e.g. Spring 2026"
                />
              </div>

              {/* Game type */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  Game type
                </label>
                <SegmentedControl
                  options={SPORT_OPTIONS}
                  value={variant}
                  onChange={setVariant}
                  size="sm"
                />
              </div>

              {/* Team color */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  Team color
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PALETTE.map((c) => {
                    const active = color.toLowerCase() === c.toLowerCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                          active ? "scale-110 border-foreground" : "border-border"
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
                    className="h-7 w-7 cursor-pointer rounded-full border-2 border-border"
                    aria-label="Custom color"
                  />
                </div>
              </div>

              {/* Logo */}
              <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={pending} />

              {/* Game rules summary + customize */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setView("rules")}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-inset/40 px-3 py-2.5 text-left hover:border-foreground/30 hover:bg-surface-inset"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Game rules
                    </div>
                    <div className="mt-0.5 truncate text-sm text-foreground">
                      {summary}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted group-hover:text-foreground">
                    Customize →
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div
              key="rules"
              className="overflow-y-auto p-5 duration-200 animate-in fade-in slide-in-from-right-2"
            >
              <PlaybookRulesForm
                value={settings}
                onChange={(s) => {
                  touchedSettingsRef.current = true;
                  setSettings(s);
                }}
                disabled={pending}
                hideHeader
                sportVariant={variant}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            {view === "basics" ? (
              <>
                <Button variant="ghost" onClick={onClose} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={submit}
                  loading={pending}
                  disabled={!name.trim()}
                >
                  Create
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setView("basics")}>
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Short one-line description of the playbook's rule settings, shown
 *  on the Create dialog's "Customize rules" card so coaches can see
 *  the current state at a glance before opening the rules editor. */
function rulesSummary(s: PlaybookSettings): string {
  const parts: string[] = [];
  parts.push(`${s.maxPlayers} offense`);
  parts.push(s.rushingAllowed ? "rushing on" : "no rushing");
  if (s.handoffsAllowed) parts.push("handoffs");
  if (s.blockingAllowed) parts.push("blocking");
  if (s.centerIsEligible) parts.push("center eligible");
  return parts.join(" · ");
}

const PALETTE = [
  "#F26522", "#EF4444", "#EAB308", "#22C55E",
  "#3B82F6", "#A855F7", "#EC4899", "#1C1C1E",
];

function DuplicatePlaybookDialog({
  tile,
  pending,
  onClose,
  onDuplicate,
}: {
  tile: DashboardPlaybookTile;
  pending: boolean;
  onClose: () => void;
  onDuplicate: (name: string, opts: { copyKb: boolean }) => void;
}) {
  const [name, setName] = useState(`${tile.name} (copy)`);
  const [kbCount, setKbCount] = useState<number | null>(null);
  const [copyKb, setCopyKb] = useState(false);

  // Fetch the source playbook's KB note count once on mount so the
  // "also copy notes" checkbox only appears when there's something to copy.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getPlaybookKbCountAction(tile.id);
      if (cancelled) return;
      setKbCount(res.ok ? res.count : 0);
    })();
    return () => { cancelled = true; };
  }, [tile.id]);

  function submit() {
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    onDuplicate(trimmed, { copyKb });
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (pending) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (pending) return;
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">Duplicate playbook</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-sm text-muted">
            This will copy every play in <span className="font-medium text-foreground">{tile.name}</span> into a new
            playbook you own. You can rename it before creating.
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
          {kbCount !== null && kbCount > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-surface-inset px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={copyKb}
                onChange={(e) => setCopyKb(e.target.checked)}
                disabled={pending}
                className="mt-0.5 size-4 cursor-pointer accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Also copy Coach Cal notes ({kbCount})</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Schemes, terminology, opponent notes, and other team-specific knowledge
                  attached to this playbook&apos;s Coach Cal knowledge base.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!name.trim() || pending}
            loading={pending}
          >
            {pending ? "Copying plays…" : "Create copy"}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}


type HomeTab = "playbooks" | "calendar" | "inbox";

function HomeTabNav({
  tab,
  onChange,
  inboxCount,
  inboxUrgent,
  showCalendar,
}: {
  tab: HomeTab;
  onChange: (t: HomeTab) => void;
  inboxCount: number;
  inboxUrgent: boolean;
  showCalendar: boolean;
}) {
  const tabs: HomeTab[] = ["playbooks"];
  if (showCalendar) tabs.push("calendar");
  tabs.push("inbox");
  const labels: Record<HomeTab, string> = {
    playbooks: "Playbooks",
    calendar: "Calendar",
    inbox: "Inbox",
  };
  return (
    <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-border">
      {tabs.map((t) => {
        const active = tab === t;
        const showInboxBadge = t === "inbox" && inboxCount > 0;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={
              "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-foreground hover:bg-surface-hover")
            }
          >
            {labels[t]}
            {showInboxBadge && (
              <span
                className={
                  "rounded-full px-1.5 py-px text-[10px] font-semibold " +
                  (active ? "bg-white/25 text-primary-foreground" : "bg-red-600 text-white")
                }
                title={
                  inboxUrgent
                    ? `${inboxCount} item${inboxCount === 1 ? "" : "s"} need attention`
                    : undefined
                }
              >
                {inboxCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
