/**
 * One-shot geolocation capture. Uses the Capacitor plugin on native
 * (which manages the iOS/Android permission prompt) and falls back to the
 * browser Geolocation API on the web.
 *
 * Returns `null` instead of throwing on denial/timeout so callers can
 * fire-and-forget and silently skip if the user declines.
 */
import { isNativeApp } from "./isNativeApp";

export type Coords = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export async function captureCurrentLocation(timeoutMs = 8000): Promise<Coords | null> {
  if (isNativeApp()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const req = await Geolocation.requestPermissions();
        if (req.location !== "granted") return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 5 * 60_000,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };
    } catch {
      return null;
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<Coords | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    );
  });
}
