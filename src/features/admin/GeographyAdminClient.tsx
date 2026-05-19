"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui";
import {
  getGeoSummaryAction,
  type GeoSummary,
  type GeoCityPoint,
} from "@/app/actions/admin-geography";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function cityLabel(c: GeoCityPoint): string {
  const parts: string[] = [];
  if (c.city) parts.push(c.city);
  if (c.region) parts.push(c.region);
  if (c.country) parts.push(c.country);
  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

// Proportional-symbol scale: dot radius scales with sqrt(views) so the
// AREA of the dot — not the radius — is proportional to usage. That's
// the convention coaches expect when reading a density map.
function radiusForViews(views: number, maxViews: number): number {
  if (maxViews <= 0) return 4;
  const minR = 4;
  const maxR = 26;
  const ratio = Math.sqrt(views) / Math.sqrt(maxViews);
  return minR + (maxR - minR) * ratio;
}

function GeographyMap({ cities }: { cities: GeoCityPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<CircleMarker[]>([]);

  // Init once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [25, 0],
        zoom: 2,
        worldCopyJump: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = [];
    };
  }, []);

  // Repaint markers whenever the data changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (cancelled || !map) return;

      for (const m of markerLayerRef.current) {
        m.remove();
      }
      markerLayerRef.current = [];

      if (cities.length === 0) return;

      const maxViews = cities.reduce((m, c) => Math.max(m, c.views), 0);

      for (const c of cities) {
        const marker = L.circleMarker([c.latitude, c.longitude], {
          radius: radiusForViews(c.views, maxViews),
          color: "#2563eb",
          weight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.45,
        });
        marker.bindTooltip(
          `<strong>${cityLabel(c)}</strong><br/>` +
            `${formatInt(c.views)} view${c.views === 1 ? "" : "s"} • ` +
            `${formatInt(c.sessions)} session${c.sessions === 1 ? "" : "s"}` +
            (c.users > 0 ? `<br/>${formatInt(c.users)} signed-in user${c.users === 1 ? "" : "s"}` : "") +
            (c.signups > 0 ? `<br/>${formatInt(c.signups)} new signup${c.signups === 1 ? "" : "s"}` : ""),
          { direction: "top", offset: [0, -2] },
        );
        marker.addTo(map);
        markerLayerRef.current.push(marker);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cities]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="World map of user activity by city"
      className="h-[520px] w-full overflow-hidden rounded-2xl ring-1 ring-border"
    />
  );
}

export function GeographyAdminClient({
  initialSummary,
  initialError,
}: {
  initialSummary: GeoSummary;
  initialError: string | null;
}) {
  const [summary, setSummary] = useState<GeoSummary>(initialSummary);
  const [windowDays, setWindowDays] = useState<number>(initialSummary.windowDays);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function refresh(nextDays: number) {
    startTransition(async () => {
      const res = await getGeoSummaryAction(nextDays);
      if (res.ok) {
        setSummary(res.summary);
        setWindowDays(res.summary.windowDays);
        setError(null);
      } else {
        setError(res.error);
        toast(res.error, "error");
      }
    });
  }

  const totalSignups = useMemo(
    () => summary.countries.reduce((acc, c) => acc + c.signups, 0),
    [summary.countries],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Geography</h2>
          <p className="mt-1 text-sm text-muted">
            City dots are sized by views (area ∝ usage). Rows captured before this
            tab shipped don&apos;t have coordinates yet — they&apos;ll show up in
            the country table but not on the map.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30, 90, 365] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => refresh(d)}
              disabled={pending}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                windowDays === d
                  ? "bg-foreground text-background ring-foreground"
                  : "bg-surface-raised text-foreground ring-border hover:bg-surface-inset"
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => refresh(windowDays)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-raised px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-border hover:bg-surface-inset disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Cities"
          value={formatInt(summary.totals.cities)}
          sub="distinct on the map"
        />
        <StatTile
          label="Countries"
          value={formatInt(summary.totals.countries)}
          sub="incl. unplotted"
        />
        <StatTile
          label="Plotted views"
          value={formatInt(summary.totals.plottedViews)}
          sub={
            summary.totals.missingLocation > 0
              ? `${formatInt(summary.totals.missingLocation)} unplotted`
              : "all views mapped"
          }
        />
        <StatTile label="New signups" value={formatInt(totalSignups)} sub="in window" />
      </div>

      <GeographyMap cities={summary.cities} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Top cities</h3>
          {summary.cities.length === 0 ? (
            <p className="text-sm text-muted">No located views yet in this window.</p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">City</th>
                    <th className="px-3 py-2 text-right font-medium">Views</th>
                    <th className="px-3 py-2 text-right font-medium">Sessions</th>
                    <th className="px-3 py-2 text-right font-medium">Signups</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {summary.cities.slice(0, 25).map((c) => (
                    <tr key={c.key}>
                      <td className="px-3 py-2 text-foreground">{cityLabel(c)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {formatInt(c.views)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {formatInt(c.sessions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {c.signups > 0 ? formatInt(c.signups) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Top countries</h3>
          {summary.countries.length === 0 ? (
            <p className="text-sm text-muted">No country data yet in this window.</p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Country</th>
                    <th className="px-3 py-2 text-right font-medium">Views</th>
                    <th className="px-3 py-2 text-right font-medium">Sessions</th>
                    <th className="px-3 py-2 text-right font-medium">Signups</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {summary.countries.slice(0, 25).map((c) => (
                    <tr key={c.country}>
                      <td className="px-3 py-2 text-foreground">
                        {countryName(c.country)}{" "}
                        <span className="text-xs text-muted">({c.country})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {formatInt(c.views)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {formatInt(c.sessions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {c.signups > 0 ? formatInt(c.signups) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
