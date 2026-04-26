"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui";
import {
  autocompletePlacesAction,
  placeDetailsAction,
  type PlaceSuggestion,
} from "@/app/actions/places";

export type SelectedPlace = {
  placeId: string | null;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

function newSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Place picker backed by Google Places (New). Free-text fallback: if the user
 * types and never picks a suggestion, we still keep what they typed as the
 * location name (placeId/lat/lng will be null). The native-maps deep link
 * still works on plain text.
 */
export function PlaceAutocomplete({
  initial,
  onChange,
  placeholder = "Add location",
}: {
  initial: SelectedPlace | null;
  onChange: (next: SelectedPlace | null) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<string>(newSessionToken());
  const [query, setQuery] = useState(initial?.name ?? "");
  const [debounced, setDebounced] = useState(query);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SelectedPlace | null>(initial);
  // True only between a keystroke and the next pick/clear/blur. Gates both
  // the suggestion fetch and the dropdown visibility so external state
  // changes (e.g. the map pin pan writing back coords) never re-open the
  // dropdown — fixes the bug where dragging the pin showed stale Places
  // suggestions from earlier in the session.
  const [userEdited, setUserEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDetails, startDetails] = useTransition();
  const [pendingList, startList] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!userEdited) return;
    if (picked && picked.name === debounced) return;
    if (debounced.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const token = sessionTokenRef.current;
    startList(async () => {
      const res = await autocompletePlacesAction(debounced, token);
      if (!res.ok) {
        setError(res.error);
        setSuggestions([]);
        return;
      }
      setError(null);
      setSuggestions(res.suggestions);
    });
  }, [debounced, picked, userEdited]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(s: PlaceSuggestion) {
    const token = sessionTokenRef.current;
    startDetails(async () => {
      const res = await placeDetailsAction(s.placeId, token);
      // Rotate session token after a successful selection per Google's
      // billing model: one session = one autocomplete + one details call.
      sessionTokenRef.current = newSessionToken();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const next: SelectedPlace = {
        placeId: res.place.placeId,
        name: res.place.name || s.primaryText,
        address: res.place.formattedAddress,
        lat: res.place.lat,
        lng: res.place.lng,
      };
      setPicked(next);
      setQuery(next.name);
      setOpen(false);
      setSuggestions([]);
      setUserEdited(false);
      onChange(next);
    });
  }

  function clear() {
    setPicked(null);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setUserEdited(false);
    onChange(null);
  }

  function handleBlurCommit() {
    // If the user typed something but never picked a suggestion, save it as
    // free-text — the player-side deep link still works.
    const text = query.trim();
    if (!text) {
      if (picked) clear();
      return;
    }
    if (picked && picked.name === text) return;
    const next: SelectedPlace = {
      placeId: null,
      name: text,
      address: "",
      lat: null,
      lng: null,
    };
    setPicked(next);
    setUserEdited(false);
    onChange(next);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setUserEdited(true);
            if (picked) {
              setPicked(null);
              onChange(null);
            }
          }}
          onFocus={() => {
            // Only re-open if the user is actively re-editing — never on
            // programmatic focus shifts triggered by other UI.
            if (userEdited) setOpen(true);
          }}
          onBlur={handleBlurCommit}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          role="combobox"
          autoComplete="off"
          className="pl-9 pr-9"
        />
        {(pendingList || pendingDetails) && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
        )}
        {!pendingList && !pendingDetails && query.length > 0 && (
          <button
            type="button"
            aria-label="Clear location"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {picked?.address && picked.address !== picked.name && (
        <p className="mt-1 px-1 text-xs text-muted">{picked.address}</p>
      )}

      {open && userEdited && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
        >
          {suggestions.map((s) => (
            <li key={s.placeId} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-surface-inset"
              >
                <span className="text-sm font-medium text-foreground">
                  {s.primaryText}
                </span>
                {s.secondaryText && (
                  <span className="text-xs text-muted">{s.secondaryText}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
