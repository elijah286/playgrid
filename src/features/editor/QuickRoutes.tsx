"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Player, RouteStyle, Point2, SegmentShape } from "@/domain/play/types";
import {
  ROUTE_TEMPLATES,
  instantiateTemplate,
  type RouteTemplate,
} from "@/domain/play/routeTemplates";
import {
  instantiateUserTemplate,
  type UserRouteTemplate,
} from "@/domain/play/userRouteTemplates";
import type { UserRouteTemplatesHook } from "./useUserRouteTemplates";

type Props = {
  player: Player;
  dispatch: (c: PlayCommand) => void;
  activeStyle?: Partial<RouteStyle>;
  existingRouteIds?: readonly string[];
  userTemplates: UserRouteTemplatesHook;
};

// Generic thumbnail (uniform scale so angles stay accurate — see comment in
// the original implementation re Post vs Skinny Post). Accepts either a
// system or user template's geometry.
function RouteThumbnail({
  points,
  shapes,
}: {
  points: Point2[];
  shapes?: readonly SegmentShape[];
}) {
  if (points.length === 0) return null;

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const maxRange = Math.max(maxX - minX, maxY - minY, 0.08);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const pad = 5;
  const size = 30;

  const scaled = points.map((p) => ({
    x: pad + size / 2 + ((p.x - centerX) / maxRange) * size,
    y: pad + size / 2 - ((p.y - centerY) / maxRange) * size,
  }));

  const pathParts: string[] = [`M ${scaled[0].x.toFixed(1)} ${scaled[0].y.toFixed(1)}`];
  for (let i = 1; i < scaled.length; i++) {
    const shape = shapes?.[i - 1] ?? "straight";
    const p = scaled[i];
    if (shape === "curve" && i >= 2) {
      const prev = scaled[i - 1];
      pathParts.push(`Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    } else {
      pathParts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  }
  const d = pathParts.join(" ");

  return (
    <svg viewBox={`0 0 ${size + pad * 2} ${size + pad * 2}`} className="h-10 w-10">
      <circle cx={scaled[0].x} cy={scaled[0].y} r={3} fill="#94a3b8" />
      <path
        d={d}
        fill="none"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={scaled[scaled.length - 1].x}
        cy={scaled[scaled.length - 1].y}
        r={2}
        fill="#F26522"
      />
    </svg>
  );
}

function SystemTile({
  template,
  onPick,
}: {
  template: RouteTemplate;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-surface-raised"
      onClick={onPick}
    >
      <div className="flex-shrink-0 rounded bg-surface-dark/60">
        <RouteThumbnail points={template.points} shapes={template.shapes} />
      </div>
      <span className="text-xs font-medium text-foreground">{template.name}</span>
    </button>
  );
}

function UserTile({
  template,
  onPick,
  onRename,
  onDelete,
}: {
  template: UserRouteTemplate;
  onPick: () => void;
  onRename: (newName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(template.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) {
      setDraft(template.name);
      setErr(null);
      // Defer to next tick so the input is mounted before focus().
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [renaming, template.name]);

  // Close the kebab when clicking anywhere else.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      // The kebab and menu are siblings in this tile — close on any
      // outside click that isn't inside this tile's container.
      const tile = (e.target as HTMLElement).closest("[data-user-tile]");
      if (!tile || tile !== tileRef.current) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const tileRef = useRef<HTMLDivElement | null>(null);

  if (renaming) {
    return (
      <div
        className="col-span-2 flex items-center gap-2 rounded-lg border border-primary/60 bg-surface-inset px-2 py-1.5"
        data-user-tile
        ref={tileRef}
      >
        <div className="flex-shrink-0 rounded bg-surface-dark/60">
          <RouteThumbnail points={template.points} shapes={template.shapes} />
        </div>
        <input
          ref={inputRef}
          type="text"
          maxLength={40}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Escape") {
              setRenaming(false);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const name = draft.trim();
              if (!name) {
                setErr("Name can't be empty.");
                return;
              }
              if (name === template.name) {
                setRenaming(false);
                return;
              }
              setBusy(true);
              const res = await onRename(name);
              setBusy(false);
              if (res.ok) setRenaming(false);
              else setErr(res.error);
            }
          }}
          className="flex-1 rounded bg-surface-dark/80 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={busy}
        />
        <div className="flex flex-col items-end gap-0.5">
          <button
            type="button"
            disabled={busy}
            className="text-[10px] uppercase tracking-wide text-primary hover:text-primary/80 disabled:opacity-50"
            onClick={async () => {
              const name = draft.trim();
              if (!name) {
                setErr("Name can't be empty.");
                return;
              }
              if (name === template.name) {
                setRenaming(false);
                return;
              }
              setBusy(true);
              const res = await onRename(name);
              setBusy(false);
              if (res.ok) setRenaming(false);
              else setErr(res.error);
            }}
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            className="text-[10px] uppercase tracking-wide text-muted hover:text-foreground disabled:opacity-50"
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
        </div>
        {err && (
          <p className="col-span-2 mt-1 text-[10px] text-danger">{err}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className="group relative flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-2 py-1.5 transition-colors hover:border-primary/40 hover:bg-surface-raised"
      data-user-tile
      ref={tileRef}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left"
        onClick={onPick}
      >
        <div className="flex-shrink-0 rounded bg-surface-dark/60">
          <RouteThumbnail points={template.points} shapes={template.shapes} />
        </div>
        <span className="text-xs font-medium text-foreground">{template.name}</span>
      </button>
      <button
        type="button"
        aria-label={`Edit ${template.name}`}
        className="ml-auto rounded p-1 text-muted opacity-0 transition-opacity hover:bg-surface-dark hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((o) => !o);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute right-1 top-8 z-10 w-32 overflow-hidden rounded-md border border-border bg-surface-raised py-1 shadow-elevated">
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-inset"
            onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            disabled={busy}
            className="w-full px-3 py-1.5 text-left text-xs text-danger hover:bg-surface-inset disabled:opacity-50"
            onClick={async () => {
              if (!confirm(`Delete route "${template.name}"?`)) {
                setMenuOpen(false);
                return;
              }
              setBusy(true);
              await onDelete();
              // No need to clear busy — the tile unmounts on success.
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function QuickRoutes({
  player,
  dispatch,
  activeStyle,
  existingRouteIds,
  userTemplates,
}: Props) {
  const [query, setQuery] = useState("");
  const [systemCollapsed, setSystemCollapsed] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);

  const q = query.trim().toLowerCase();
  const filteredSystem = q
    ? ROUTE_TEMPLATES.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false),
      )
    : ROUTE_TEMPLATES;
  const filteredUser = q
    ? userTemplates.templates.filter((t) => t.name.toLowerCase().includes(q))
    : userTemplates.templates;

  const hasUserTemplates = userTemplates.templates.length > 0;

  // Common click handler: clear existing routes on this player, then add the
  // new route. Mirrors the original behavior so picking a quick route swaps
  // assignment rather than stacking.
  const applyRoute = (route: import("@/domain/play/types").Route) => {
    for (const rid of existingRouteIds ?? []) {
      dispatch({ type: "route.remove", routeId: rid });
    }
    dispatch({ type: "route.add", route });
  };

  const pickSystem = (template: RouteTemplate) => {
    const route = instantiateTemplate(template, player.position, player.id, activeStyle);
    applyRoute(route);
  };

  const pickUser = (template: UserRouteTemplate) => {
    const route = instantiateUserTemplate(template, player.position, player.id);
    applyRoute(route);
  };

  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Quick routes
      </h3>

      <input
        type="search"
        placeholder="Search routes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-surface-inset px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {!hasUserTemplates && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {filteredSystem.length === 0 && (
            <p className="col-span-2 py-3 text-center text-[11px] text-muted">
              No routes match &ldquo;{query}&rdquo;
            </p>
          )}
          {filteredSystem.map((template) => (
            <SystemTile
              key={template.name}
              template={template}
              onPick={() => pickSystem(template)}
            />
          ))}
        </div>
      )}

      {hasUserTemplates && (
        <>
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-foreground"
            onClick={() => setUserCollapsed((v) => !v)}
            aria-expanded={!userCollapsed}
          >
            <span>Your routes ({userTemplates.templates.length})</span>
            <span>{userCollapsed ? "▸" : "▾"}</span>
          </button>
          {!userCollapsed && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {filteredUser.length === 0 && q && (
                <p className="col-span-2 py-2 text-center text-[11px] text-muted">
                  No custom routes match &ldquo;{query}&rdquo;
                </p>
              )}
              {filteredUser.map((template) => (
                <UserTile
                  key={template.id}
                  template={template}
                  onPick={() => pickUser(template)}
                  onRename={(name) => userTemplates.rename(template.id, name)}
                  onDelete={async () => {
                    await userTemplates.remove(template.id);
                  }}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-foreground"
            onClick={() => setSystemCollapsed((v) => !v)}
            aria-expanded={!systemCollapsed}
          >
            <span>System routes</span>
            <span>{systemCollapsed ? "▸" : "▾"}</span>
          </button>
          {!systemCollapsed && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {filteredSystem.length === 0 && (
                <p className="col-span-2 py-2 text-center text-[11px] text-muted">
                  No routes match &ldquo;{query}&rdquo;
                </p>
              )}
              {filteredSystem.map((template) => (
                <SystemTile
                  key={template.name}
                  template={template}
                  onPick={() => pickSystem(template)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
