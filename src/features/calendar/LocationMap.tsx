"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// OpenStreetMap tiles via Leaflet. The pin is rendered as a fixed CSS
// crosshair over the center of the map — to position it, the user pans
// the map underneath the pin (Google-Maps-style location picker). On
// every moveend we read the map center and report it upward.

export function LocationMap({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (next: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Init once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 17,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      // After the user finishes panning (or zooming), report the new center.
      map.on("moveend", () => {
        const c = map.getCenter();
        onChangeRef.current({ lat: c.lat, lng: c.lng });
      });

      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the parent picks a new place from autocomplete, recenter — but
  // skip if the change came from this map's own moveend (center already
  // matches), so we don't fight the user's pan.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - lat) < 1e-7 && Math.abs(c.lng - lng) < 1e-7) return;
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        role="application"
        aria-label="Pan the map to position the pin on the exact spot"
        className="h-48 w-full overflow-hidden rounded-lg ring-1 ring-border"
      />
      {/* Centered pin overlay. pointer-events-none so the user can drag the
          map straight through it. The translate puts the tip on the center. */}
      <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-9 -translate-y-4 drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
        >
          <path
            d="M12 2C7.6 2 4 5.6 4 10c0 5.5 7 11.5 7.3 11.7.4.4 1 .4 1.4 0C13 21.5 20 15.5 20 10c0-4.4-3.6-8-8-8z"
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="10" r="3" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
}
