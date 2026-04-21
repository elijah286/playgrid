"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Link2,
  LogOut,
  Lock,
  Plus,
  Settings2,
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
  leavePlaybookAction,
  setPlaybookAllowDuplicationAction,
  uploadPlaybookLogoAction,
} from "@/app/actions/playbooks";
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

const DEFAULT_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

type DashboardView = "preview" | "classic";
const VIEW_STORAGE_KEY = "dashboard.view";

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

  return (
    <div className="group relative">
      <Card hover className="overflow-hidden p-0">
      <Link href={`/playbooks/${tile.id}`} className="flex h-full flex-col">
        <div
          className="flex h-32 items-center justify-center"
          style={{ backgroundColor: color }}
        >
          {tile.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tile.logo_url}
              alt=""
              className="h-20 w-20 object-contain"
            />
          ) : (
            <span className="text-4xl font-black tracking-tight text-white drop-shadow">
              {initials}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
              {tile.name}
            </h3>
            {tile.role !== "owner" && (
              <Badge variant="default">Shared</Badge>
            )}
          </div>
          <p className="text-xs text-muted">
            {tile.season ? `${tile.season} · ` : ""}
            {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
          </p>
        </div>
      </Link>
      </Card>
      {actions.length > 0 && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionMenu items={actions} />
        </div>
      )}
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
  const sheetPlays = tile.previews.slice(0, 12);
  const hasPreviews = sheetPlays.length > 0;
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
      const MARGIN = 12;
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
      className="group relative z-0 transition-transform duration-500 ease-out"
      style={{
        perspective: "1600px",
        zIndex: hover ? 20 : 0,
        transform: hover
          ? `translate3d(${shiftX}px, -8px, 0) scale(1.35)`
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
              plays={sheetPlays.slice(6, 12)}
              blanks={Math.max(0, 6 - sheetPlays.slice(6, 12).length)}
              mounted={mounted && hasPreviews}
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
                {tile.role !== "owner" && (
                  <Badge variant={tile.role === "editor" ? "primary" : "default"}>
                    {tile.role === "editor" ? "Editor" : "Viewer"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-1 items-center justify-center">
                {tile.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tile.logo_url}
                    alt=""
                    className="h-28 w-28 object-contain drop-shadow"
                  />
                ) : (
                  <span className="text-7xl font-black tracking-tight drop-shadow">
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
                plays={sheetPlays.slice(0, 6)}
                blanks={Math.max(0, 6 - sheetPlays.slice(0, 6).length)}
                mounted={mounted && hasPreviews}
              />
            </div>
          </div>
        </div>
      </Link>

      {actions.length > 0 && (
        <div
          className="absolute right-2 top-2 z-10 rounded-full bg-surface-raised shadow-sm ring-1 ring-border opacity-0 transition-[transform,opacity] group-hover:opacity-100"
          style={{
            transform: hover ? `scale(${1 / 1.35})` : "scale(1)",
            transformOrigin: "top right",
          }}
        >
          <ActionMenu items={actions} open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      )}
    </div>
  );
}

function PlaysheetColumn({
  plays,
  blanks,
  mounted,
}: {
  plays: { players: Player[]; routes: Route[]; zones: Zone[]; lineOfScrimmageY: number }[];
  blanks: number;
  mounted: boolean;
}) {
  return (
    <div className="grid flex-1 grid-cols-2 grid-rows-3 gap-1.5">
      {mounted &&
        plays.map((p, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-sm bg-white ring-1 ring-border/70"
          >
            <PlayThumbnail preview={p} thin />
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

  // Repeat the sample fan so each page has 6 thumbs.
  const sheetPlays = [
    ...SAMPLE_FAN_PREVIEWS,
    ...SAMPLE_FAN_PREVIEWS,
    ...SAMPLE_FAN_PREVIEWS,
  ]
    .slice(0, 12)
    .map((p) => ({
      players: p.players,
      routes: p.routes,
      zones: p.zones ?? [],
      lineOfScrimmageY: p.lineOfScrimmageY,
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
              plays={sheetPlays.slice(6, 12)}
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
                  className="h-28 w-28 drop-shadow-lg"
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
                plays={sheetPlays.slice(0, 6)}
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
      className="group flex h-full min-h-[212px] flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-inset/40 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <div className="flex h-32 items-center justify-center bg-surface-inset/60 group-hover:bg-primary/10">
        <Plus className="size-10 text-muted group-hover:text-primary" strokeWidth={1.5} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="truncate text-base font-bold text-muted group-hover:text-primary">
          New playbook
        </h3>
        <p className="text-xs text-muted">Click to create</p>
      </div>
    </button>
  );
}

export function DashboardClient({ data }: { data: DashboardSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [duplicating, setDuplicating] = useState<DashboardPlaybookTile | null>(null);
  const [view, setView] = useDashboardView();

  const owned = data.playbooks.filter((b) => b.role === "owner" && !b.is_default);
  const shared = data.playbooks.filter((b) => b.role !== "owner");
  const isEmpty = owned.length === 0 && shared.length === 0;

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
            toast(r.error ?? errLabel, "error");
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
        toast(res.error, "error");
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

  function buildOwnerActions(tile: DashboardPlaybookTile): ActionMenuItem[] {
    return [
      {
        label: "Invite",
        icon: UserPlus,
        onSelect: () => router.push(`/playbooks/${tile.id}?share=1`),
      },
      {
        label: "Customize",
        icon: Settings2,
        onSelect: () => router.push(`/playbooks/${tile.id}?customize=1`),
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
      {
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
        onSelect: () => router.push(`/playbooks/${tile.id}?share=1`),
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

  return (
    <div className="space-y-8">
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
            <Button
              variant="primary"
              size="sm"
              leftIcon={Plus}
              onClick={() => setShowCreate(true)}
            >
              New playbook
            </Button>
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
      </div>

      {isEmpty ? (
        <div className="mx-auto w-60 pt-4 sm:w-64">
          <MarketingPlaybookTile onCreate={() => setShowCreate(true)} />
        </div>
      ) : view === "preview" ? (
        <>
          {/* Owned — book mode */}
          <section>
            {owned.length === 1 ? (
              <div className="mx-auto w-64 sm:w-72">
                <PlaybookBookTile
                  tile={owned[0]}
                  actions={buildOwnerActions(owned[0])}
                />
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3">
                {owned.map((b) => (
                  <div key={b.id} className="w-40 sm:w-48 lg:w-56">
                    <PlaybookBookTile
                      tile={b}
                      actions={buildOwnerActions(b)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {shared.length > 0 && (
            <section>
              <div className="flex flex-wrap justify-center gap-3">
                {shared.map((b) => (
                  <div key={b.id} className="w-40 sm:w-48 lg:w-56">
                    <PlaybookBookTile tile={b} actions={buildSharedActions(b)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {/* Classic grid */}
          <section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NewPlaybookTile onClick={() => setShowCreate(true)} />
              {owned.map((b) => (
                <PlaybookTile
                  key={b.id}
                  tile={b}
                  actions={buildOwnerActions(b)}
                />
              ))}
            </div>
          </section>

          {shared.length > 0 && (
            <section>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {shared.map((b) => (
                  <PlaybookTile key={b.id} tile={b} actions={buildSharedActions(b)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {duplicating && (
        <DuplicatePlaybookDialog
          tile={duplicating}
          onClose={() => setDuplicating(null)}
          onDuplicate={(name) => {
            const tileId = duplicating.id;
            setDuplicating(null);
            handle(
              () => duplicatePlaybookAction(tileId, name),
              (res) => {
                if (res.ok) router.push(`/playbooks/${res.id}`);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface-raised shadow-elevated sm:max-w-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">New playbook</h2>
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
  );
}

const PALETTE = [
  "#F26522", "#EF4444", "#EAB308", "#22C55E",
  "#3B82F6", "#A855F7", "#EC4899", "#1C1C1E",
];

function DuplicatePlaybookDialog({
  tile,
  onClose,
  onDuplicate,
}: {
  tile: DashboardPlaybookTile;
  onClose: () => void;
  onDuplicate: (name: string) => void;
}) {
  const [name, setName] = useState(`${tile.name} (copy)`);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onDuplicate(trimmed);
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

