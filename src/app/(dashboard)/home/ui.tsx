"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
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
  X,
} from "lucide-react";
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
import type { InboxAlert } from "@/app/actions/inbox";
import type { ActivityEntry } from "@/app/actions/activity";

const DEFAULT_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

type DashboardView = "preview" | "classic";
const VIEW_STORAGE_KEY = "dashboard.view";

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

// The book-preview animation is hover-driven and feels fiddly on touch.
// Detect input capability rather than viewport size: a wide touch laptop
// still gets Simple mode, a narrow desktop window keeps the animation.
function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from matchMedia
    setTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return touch;
}

function useDashboardView(): [DashboardView, (v: DashboardView) => void] {
  const [view, setView] = useState<DashboardView>("preview");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "preview" || stored === "classic") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating user preference from localStorage
        setView(stored);
        return;
      }
      // No explicit preference: default to Classic on small screens because
      // the open-book layout needs the horizontal room to read.
      if (window.matchMedia("(max-width: 767px)").matches) {
        setView("classic");
      }
    } catch {}
  }, []);
  const update = (v: DashboardView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {}
  };
  return [view, update];
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
            {tile.role !== "owner" && <Badge variant="default">Shared</Badge>}
          </div>
        </div>
        <p className="text-[11px] text-muted">
          {tile.season ? `${tile.season} · ` : ""}
          {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );

  return (
    <div className="group relative">
      <Card hover className="relative overflow-hidden p-0">
        {locked ? (
          <div className="flex h-full flex-col opacity-60">{inner}</div>
        ) : (
          <Link href={`/playbooks/${tile.id}`}>{inner}</Link>
        )}
        {locked && <LockedOverlay />}
      </Card>
      {!locked && actions.length > 0 && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionMenu items={actions} />
        </div>
      )}
    </div>
  );
}

function LockedOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur-[1px]">
      <Lock className="size-7" />
      <p className="px-3 text-center text-xs font-semibold">
        Locked — plan downgraded
      </p>
      <Link
        href="/pricing"
        data-web-only
        className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-neutral-100"
      >
        Upgrade to unlock
      </Link>
    </div>
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
function PlaybookBookTile({
  tile,
  actions,
}: {
  tile: DashboardPlaybookTile;
  actions: ActionMenuItem[];
}) {
  if (tile.is_locked) {
    return <LockedBookTile tile={tile} />;
  }
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
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
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

            <div className="flex h-full flex-col justify-between p-5 text-white">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                  Playbook
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[120px]">
                  {tile.is_example && <Badge variant="primary">Example</Badge>}
                  {tile.role !== "owner" && (
                    <Badge variant={tile.role === "editor" ? "primary" : "default"}>
                      {tile.role === "editor" ? "Editor" : "Viewer"}
                    </Badge>
                  )}
                </div>
              </div>

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
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/55 text-white">
        <Lock className="size-8" />
        <p className="px-3 text-center text-xs font-semibold">
          Locked — plan downgraded
        </p>
        <Link
          href="/pricing"
          className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-neutral-100"
        >
          Upgrade to unlock
        </Link>
      </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Like what you&rsquo;re seeing? Build your own playbook — free.
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            You can create your own playbook with up to 16 plays at no cost,
            and keep collaborating on the ones above.
          </p>
        </div>
        <Button variant="primary" size="sm" leftIcon={Plus} onClick={onCreate}>
          Build my playbook
        </Button>
      </div>
    </div>
  );
}

/**
 * Marketing tile shown when a coach has no playbooks yet. Looks like a real
 * PlaybookBookTile (opens on hover), but it's fake — samples preview plays,
 * a generic lion logo, and clicking opens the Create Playbook dialog.
 */
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
}: {
  data: DashboardSummary;
  hideAnimation?: boolean;
  isAdmin?: boolean;
  teamCalendarAvailable?: boolean;
  canUseTeamFeatures?: boolean;
  inboxAlerts?: InboxAlert[];
  activityEntries?: ActivityEntry[];
  initialTab?: HomeTab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const homeTab: HomeTab =
    tabParam === "activity"
      ? "inbox"
      : tabParam === "calendar" ||
          tabParam === "inbox" ||
          tabParam === "playbooks"
        ? tabParam
        : initialTab;
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
  const inboxCount = inboxAlerts.length;
  // Inbox is "urgent" when it contains time-pressured items: pending RSVPs
  // or (future) billing/system alerts. Otherwise the badge stays neutral.
  const inboxUrgent = inboxAlerts.some(
    (a) => a.kind === "rsvp_pending" || a.kind === "system_alert",
  );
  const activityCount = activityEntries.length;
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{
    title: string;
    message: string;
    secondaryLabel?: string;
    secondaryHref?: string;
  } | null>(null);
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
  const [storedView, setView] = useDashboardView();
  // The open-book hover animation is fiddly on touch — force Simple mode
  // and hide the toggle on touch devices regardless of viewport size.
  const isTouch = useIsTouchDevice();
  const effectiveHideAnimation = hideAnimation || isTouch;
  const view: DashboardView = effectiveHideAnimation ? "classic" : storedView;
  const [showArchived, setShowArchived] = usePersistedFlag(
    "dashboard.showArchived",
  );
  const [showExamples, setShowExamples] = usePersistedFlag(
    "dashboard.showExamples",
  );

  const ownedAll = data.playbooks.filter((b) => b.role === "owner" && !b.is_default);
  const sharedAll = data.playbooks.filter((b) => b.role !== "owner");
  // Example playbooks are pulled out of the main grid so the admin's
  // real work isn't mixed with marketing copies. They only show when
  // the admin toggles "Show marketing examples".
  const examples = [...ownedAll, ...sharedAll].filter(
    (b) => b.is_example && !b.is_archived,
  );
  const owned = ownedAll.filter((b) => !b.is_archived && !b.is_example);
  const shared = sharedAll.filter((b) => !b.is_archived && !b.is_example);
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
              setUpgradeNotice({
                title: "Upgrade to Team Coach",
                message: r.error,
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
          // slot, and the existing one is fully editable.
          const existing = ownedAll[0] ?? null;
          setUpgradeNotice({
            title: "You already have your free playbook",
            message: existing
              ? `Free accounts include one playbook — “${existing.name}”. Open it to add or edit plays, or upgrade to Team Coach ($9/mo or $99/yr) for unlimited playbooks.`
              : "Upgrade to Team Coach ($9/mo or $99/yr) to create unlimited playbooks. Your existing content stays where it is.",
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
              () => handle(() => deletePlaybookAction(tile.id)),
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
            onSelect: () => handle(() => archivePlaybookAction(tile.id, true)),
          },
      {
        label: "Delete",
        icon: Trash2,
        danger: true,
        onSelect: () =>
          confirmAnd(
            `Delete "${tile.name}" and all its plays? This can't be undone.`,
            () => handle(() => deletePlaybookAction(tile.id)),
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
      {showTabNav && (
        <HomeTabNav
          tab={homeTab}
          onChange={setHomeTab}
          inboxCount={inboxCount}
          inboxUrgent={inboxUrgent}
          showCalendar={teamCalendarAvailable}
        />
      )}

      {teamCalendarAvailable && (
        <div hidden={homeTab !== "calendar"} className="mt-6">
          <HomeCalendarTab canUseTeamFeatures={canUseTeamFeatures} />
        </div>
      )}

      <div hidden={homeTab !== "inbox"} className="mt-6">
        <InboxTab
          initialAlerts={inboxAlerts}
          initialActivity={activityEntries}
        />
      </div>

      <div hidden={homeTab !== "playbooks"} className="mt-8 space-y-8">
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
        <div className="mx-auto flex w-60 flex-col items-center gap-3 pt-4 sm:w-64">
          <MarketingPlaybookTile onCreate={() => setShowCreate(true)} />
          <Link
            href="/examples"
            className="text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Or browse example playbooks →
          </Link>
        </div>
      ) : view === "preview" ? (
        <section className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
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
              <div className="grid grid-cols-2 gap-3 opacity-70 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
              <div className="grid grid-cols-2 gap-3 opacity-70 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

      {!isEmpty && !effectiveHideAnimation && (
        <div className="flex flex-col items-center gap-1.5 pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Tile style
          </span>
          <SegmentedControl
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "preview", label: "Preview" },
              { value: "classic", label: "Simple" },
            ]}
          />
        </div>
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
            handle(
              () => duplicatePlaybookAction(tileId, name, { copyKb: dupOpts.copyKb }),
              (res) => {
                if (res.ok) {
                  setDuplicating(null);
                  toast("Playbook duplicated", "success");
                }
              },
            );
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
          variantLabel={SPORT_VARIANT_LABELS[customizing.sport_variant] ?? ""}
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
      </div>
    </div>
  );
}

const SPORT_OPTIONS: { value: SportVariant; label: string }[] = [
  { value: "flag_5v5", label: SPORT_VARIANT_LABELS.flag_5v5 },
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
  const [name, setName] = useState("");
  const [variant, setVariant] = useState<SportVariant>("flag_7v7");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [logoUrl, setLogoUrl] = useState("");
  const [season, setSeason] = useState("");
  const [settings, setSettings] = useState<PlaybookSettings>(() =>
    defaultSettingsForVariant("flag_7v7"),
  );
  const [rulesOpen, setRulesOpen] = useState(false);
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
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface-raised shadow-elevated sm:max-w-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">New Playbook</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          {/* Left: appearance */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-inset/40 p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    Team color
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE.map((c) => {
                      const active = color.toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
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
                      className="h-6 w-6 cursor-pointer rounded-full border-2 border-border"
                      aria-label="Custom color"
                    />
                  </div>
                </div>
                <div
                  className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: color }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
                  ) : (
                    <span className="text-2xl font-black tracking-tight text-white drop-shadow">
                      {initials}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={pending} />
              </div>
            </div>
          </div>

          {/* Right: details */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
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

            {/* Season */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
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

            {/* Sport variant */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Game type
              </label>
              <SegmentedControl
                options={SPORT_OPTIONS}
                value={variant}
                onChange={setVariant}
                size="sm"
              />
            </div>

            {/* Game rules — collapsed by default */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground"
              >
                <span>Game rules</span>
                {rulesOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              {rulesOpen && (
                <PlaybookRulesForm
                  value={settings}
                  onChange={(s) => {
                    touchedSettingsRef.current = true;
                    setSettings(s);
                  }}
                  disabled={pending}
                  hideHeader
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
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
        </div>
      </div>
      </div>
    </div>
  );
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
                  (active
                    ? "bg-white/25 text-primary-foreground"
                    : inboxUrgent
                      ? "bg-red-600 text-white"
                      : "bg-primary text-primary-foreground")
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
