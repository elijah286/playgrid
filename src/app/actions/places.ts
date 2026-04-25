"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredGoogleMapsApiKey } from "@/lib/site/google-maps-config";

// Server-side proxy for Google Places API (New). The Maps key is read from
// site_settings and never reaches the browser. Any signed-in user can use
// these — the cost is small and gated behind auth.

async function assertSignedIn() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const };
}

export type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

export async function autocompletePlacesAction(
  input: string,
  sessionToken: string,
): Promise<
  | { ok: true; suggestions: PlaceSuggestion[] }
  | { ok: false; error: string }
> {
  const gate = await assertSignedIn();
  if (!gate.ok) return gate;

  const trimmed = input.trim();
  if (trimmed.length < 2) return { ok: true as const, suggestions: [] };

  const key = await getStoredGoogleMapsApiKey().catch(() => null);
  if (!key) {
    return {
      ok: false as const,
      error: "Google Maps is not configured (ask a site admin).",
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: trimmed,
      sessionToken,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false as const,
      error: `Places autocomplete failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  type RawSuggestion = {
    placePrediction?: {
      placeId?: string;
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
      text?: { text?: string };
    };
  };
  const data = (await res.json()) as { suggestions?: RawSuggestion[] };
  const suggestions: PlaceSuggestion[] = (data.suggestions ?? [])
    .map((s): PlaceSuggestion | null => {
      const p = s.placePrediction;
      if (!p?.placeId) return null;
      const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
      const secondary = p.structuredFormat?.secondaryText?.text ?? "";
      return { placeId: p.placeId, primaryText: main, secondaryText: secondary };
    })
    .filter((s): s is PlaceSuggestion => s !== null);

  return { ok: true as const, suggestions };
}

export type PlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
};

export async function placeDetailsAction(
  placeId: string,
  sessionToken: string,
): Promise<{ ok: true; place: PlaceDetails } | { ok: false; error: string }> {
  const gate = await assertSignedIn();
  if (!gate.ok) return gate;

  const id = placeId.trim();
  if (!id) {
    return { ok: false as const, error: "Missing place id." };
  }

  const key = await getStoredGoogleMapsApiKey().catch(() => null);
  if (!key) {
    return {
      ok: false as const,
      error: "Google Maps is not configured (ask a site admin).",
    };
  }

  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
  );
  url.searchParams.set("sessionToken", sessionToken);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false as const,
      error: `Place details failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  type Raw = {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };
  const data = (await res.json()) as Raw;
  const place: PlaceDetails = {
    placeId: data.id ?? id,
    name: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
    lat: typeof data.location?.latitude === "number" ? data.location.latitude : null,
    lng:
      typeof data.location?.longitude === "number" ? data.location.longitude : null,
  };

  return { ok: true as const, place };
}
