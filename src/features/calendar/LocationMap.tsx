"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

// OpenStreetMap tiles via Leaflet — no API key needed and no client-side
// exposure of the Google Maps key. The marker is draggable so a coach can
// nudge it onto the exact field/lot inside a venue.

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
  const markerRef = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Init once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Default marker icons reference image files that won't resolve under
      // bundlers. Point them at the unpkg CDN copy.
      const iconUrl =
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
      const iconRetinaUrl =
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
      const shadowUrl =
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

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

      const icon = L.icon({
        iconUrl,
        iconRetinaUrl,
        shadowUrl,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      // Click anywhere on the map to drop the pin there.
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep map in sync when the parent picks a different place (lat/lng change
  // from outside, e.g. a new autocomplete selection).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const cur = marker.getLatLng();
    if (cur.lat === lat && cur.lng === lng) return;
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Drag the pin or tap to set the exact spot"
      className="h-48 w-full overflow-hidden rounded-lg ring-1 ring-border"
    />
  );
}
