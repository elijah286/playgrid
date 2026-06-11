"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BookOpen, Check, Copy, Paperclip, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { CoachAiTurn, NoteProposalSavedState, PlaybookChip } from "@/app/actions/coach-ai";
import {
  pickStarterPrompts,
  type PromptContext,
  type SuggestedPrompt,
} from "@/lib/llm/suggested-prompts";
import Link from "next/link";
import {
  getAiFeedbackOptInAction,
  setAiFeedbackOptInAction,
  logCoachAiPositiveFeedbackAction,
  logCoachAiNegativeFeedbackAction,
} from "@/app/actions/coach-ai-feedback";
import { getCoachCalUpgradeBannerEnabledAction } from "@/app/actions/admin-coach-cal-banner";
import { commitPlaybookNoteProposalAction } from "@/app/actions/coach-ai-playbook-notes";
import {
  commitAttachDefenseToPlayAction,
  commitSaveDefenseProposalAction,
} from "@/app/actions/coach-ai-save-defense";
import type { SaveDefenseProposalState } from "@/app/actions/coach-ai";
import type { SaveDefenseProposal } from "@/lib/coach-ai/save-defense-tools";
import { CoachAiIcon } from "./CoachAiIcon";
import { AssistantMessageWithFeedback } from "./AssistantMessageWithFeedback";
import { AssistantMessage } from "./AssistantMessage";
import { CoachCalCostMeter } from "./CoachCalCostMeter";
import { createMessagePackCheckoutAction } from "@/app/actions/coach-cal-pack";
import type { NoteProposal } from "@/lib/coach-ai/playbook-tools";
import { readLivePlayDoc } from "@/lib/coach-ai/live-play-doc";
import { useNativePlatform } from "@/lib/native/useIsNativeApp";
import { COACH_CAL_IMAGE_UPLOADS_ENABLED } from "@/lib/coach-ai/image-upload";
import { detectAutoAnchorTarget } from "./auto-anchor";

type OutOfBudgetPayload = {
  /** which window tripped — drives copy + whether the pack CTA shows */
  window: "burst" | "day" | "month";
  /** ISO time the binding window frees up (null shouldn't happen here) */
  resetAt: string | null;
  pack: { budgetMicros: number; priceUsdCents: number; priceConfigured: boolean };
};

function formatBudgetReset(iso: string | null): string {
  if (!iso) return "soon";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatPackPriceCents(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

// Bumped if the persisted shape changes — older blobs are then ignored.
const STORAGE_VERSION = 1;
const MAX_PERSISTED_TURNS = 50;

function storageKeyFor(mode: string, playbookId: string | null | undefined): string {
  const scope = mode === "normal" ? (playbookId ?? "global") : "global";
  return `coach-ai:chat:v${STORAGE_VERSION}:${mode}:${scope}`;
}

function loadTurns(key: string): CoachAiTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CoachAiTurn =>
        t && typeof t === "object" && (t.role === "user" || t.role === "assistant") && typeof t.text === "string",
    );
  } catch {
    return [];
  }
}

function saveTurns(key: string, turns: CoachAiTurn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(turns.slice(-MAX_PERSISTED_TURNS)));
  } catch { /* quota or disabled */ }
}

// Sidecar: tracks which play (if any) the persisted chat history was last
// anchored to, so that re-opening Cal on a different play can insert a
// context-switch bridge instead of letting prior turns about Play A pollute
// a new conversation about Play B.
function lastPlayKeyFor(storageKey: string): string {
  return `${storageKey}:last-play`;
}

function loadLastPlayId(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lastPlayKeyFor(storageKey));
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function saveLastPlayId(storageKey: string, playId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (playId) window.localStorage.setItem(lastPlayKeyFor(storageKey), playId);
    else        window.localStorage.removeItem(lastPlayKeyFor(storageKey));
  } catch { /* ignore */ }
}

// Image attachment plumbing. Photos go to Anthropic's vision API which has its
// own internal resize step (long-side downsample to ~1568px for processing).
// The client's job is to FIT UNDER the server's binary cap (~5MB) without
// destroying detail Anthropic could otherwise have used. Prior version
// downsampled to 1280px @ 0.80 JPEG which sat BELOW Anthropic's processing
// ceiling — handing them less data than they'd use, and double-compressing.
// Surfaced 2026-05-21 (rounds 1-5) when coaches uploaded hand-drawn play
// sheets and Cal misread routes (curl → vertical, slant → flat, players
// silently relabeled). Investigation traced the failure to image quality,
// not Cal's prompting: arrows on a 1280-wide photo of a 6-play sheet land at
// ~213px per play box — too small + too JPEG-compressed for the vision model
// to read the route shape reliably.
//
// Round-13 (2026-05-21) bump to 4000px:
//   The per-play cropping pipeline takes the source image and slices it
//   into N per-play crops. With a 2400px source and ~31% crop width per play
//   (6-play sheet at 2 columns), each crop landed at ~586px — well UNDER
//   Anthropic's 1568px processing ceiling for individual images. Pushing the
//   source to 4000px raises each crop to ~970px, much closer to the ceiling
//   so the model uses its full processing resolution per play.
//
// Defaults:
//   - 4000px max edge — well above the 1568 per-image ceiling AND large
//     enough that per-play crops on a 6-play sheet exceed 800px each.
//   - 0.92 JPEG quality — close to lossless on natural images; preserves the
//     fine line detail in pencil arrows. A 4000×3000 JPEG at q=0.92 typically
//     lands at 3-5MB, near the 5MB binary cap.
//   - Passthrough threshold raised to 4.5MB (under the 5MB cap, with margin
//     for base64 expansion) so small files are forwarded verbatim — no
//     re-encoding loss for photos that already fit.
const MAX_IMAGE_EDGE_PX = 4000;
const IMAGE_JPEG_QUALITY = 0.92;
const PASSTHROUGH_MAX_BYTES = 4_500_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type PreparedImage = { preview: string; base64: string; mediaType: string; name: string };

async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use JPG, PNG, WebP, or GIF.");
  }
  // Filename for the chat-history attachment indicator. Pasted clipboard
  // images often have an empty / generic name ("image.png" or just ""), so
  // fall back to a friendly placeholder rather than showing nothing.
  const displayName = file.name && file.name !== "image.png" ? file.name : `pasted-image.${file.type.split("/")[1] || "png"}`;
  // GIF re-encode would lose frames; pass through. They're typically small
  // enough that the server-side base64 cap (~5MB) won't reject them.
  if (file.type === "image/gif") {
    return splitDataUrl(await readAsDataUrl(file), displayName);
  }
  // Passthrough for images that already fit under the binary cap AND don't
  // exceed the max edge. Avoids re-encoding loss on photos that are already
  // a reasonable size. Covers screenshots, downloaded images, and modern
  // iPhone HEIC-converted-to-JPEG shares.
  const img = await loadImage(file);
  const maxEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (
    maxEdge <= MAX_IMAGE_EDGE_PX &&
    file.size <= PASSTHROUGH_MAX_BYTES &&
    (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")
  ) {
    return splitDataUrl(await readAsDataUrl(file), displayName);
  }
  // Resize down to MAX_IMAGE_EDGE_PX at IMAGE_JPEG_QUALITY. Only fires for
  // photos that are over the byte cap OR over the dimension cap — most camera
  // roll JPEGs from iPhone/Android hit one or both.
  const scale = maxEdge > MAX_IMAGE_EDGE_PX ? MAX_IMAGE_EDGE_PX / maxEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process the image.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return splitDataUrl(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY), displayName);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Failed to read image file."));
    fr.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image failed to decode.")); };
    img.src = url;
  });
}

function splitDataUrl(dataUrl: string, name: string): PreparedImage {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Couldn't read image data.");
  return { preview: dataUrl, mediaType: match[1], base64: match[2], name };
}

/** Minimal SSE parser — handles `event: foo\ndata: {...}\n\n` frames. */
async function* parseSse(body: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder();
  const reader = body.getReader();
  let buf = "";
  let eventName = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      let data: string | undefined;
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6).trim();
      }
      if (data) yield { event: eventName, data };
      eventName = "message";
    }
  }
}

/**
 * Pure chat surface — fills its container. Owners (launcher / fullscreen page)
 * are responsible for sizing and outer chrome (close, fullscreen toggle).
 */
export function CoachAiChat({
  playbookId,
  playId,
  mode = "normal",
  isAdmin = false,
  injectedPrompt = null,
  imageUploadAvailable = false,
}: {
  playbookId?: string | null;
  playId?: string | null;
  mode?: "normal" | "admin_training";
  /** Site-admin flag — surfaces the "Copy JSON" debug option on assistant
   *  messages (long-press / right-click the Copy button). */
  isAdmin?: boolean;
  /**
   * When set (and `key` changes), populate the draft. If `autoSubmit` is
   * true, fire the request immediately. Used by in-app CTAs that open Cal
   * with a pre-written prompt. The `key` is what makes a *repeat* CTA
   * click re-fire — the launcher bumps it on every dispatch.
   */
  injectedPrompt?: { text: string; autoSubmit: boolean; key: number } | null;
  /**
   * Whether the photo/file attach affordance (paperclip) renders in the
   * chat input. 2026-05-21: gated behind the `coach_ai_image_upload`
   * beta flag while the hand-drawn play-sheet vision pipeline is
   * unreliable on small pencil arrows and rounded routes. The flag
   * resolves server-side via isBetaFeatureAvailable in SiteHeader.tsx;
   * default scope is "off", site admin sets "me" for self-only testing.
   */
  imageUploadAvailable?: boolean;
}) {
  const storageKey = storageKeyFor(mode, playbookId ?? null);
  // Initialize from localStorage synchronously so the first paint shows
  // the existing conversation, not the empty-state suggested prompts.
  // Without this, opening Cal mid-session flashes Empty for a frame
  // before the load-history useEffect runs and replaces it. The useEffect
  // below still handles bridge turns (playbook/play switches) and the
  // cal_from carry-over case.
  const [turns, setTurns] = useState<CoachAiTurn[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return loadTurns(storageKey);
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState("");
  // Image attached to the NEXT turn only. Cleared on send. Never persisted —
  // the server passes the image to the model in-flight, then drops it.
  const [pendingImage, setPendingImage] = useState<{
    preview: string;       // data: URL for thumbnail rendering
    base64: string;        // raw base64 (no `data:...,` prefix)
    mediaType: string;     // image/jpeg | image/png | image/webp | image/gif
    name: string;          // filename for the attachment indicator in chat history
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Coach Cal photo attachments are DISABLED (2026-06-11): the hand-drawn
  // play-sheet vision pipeline was unreliable (small pencil arrows, rounded
  // routes, dashed motion all hit-or-miss) and per-image vision calls were
  // expensive, so the feature was pulled. The leading `COACH_CAL_IMAGE_UPLOADS_ENABLED`
  // hard-off keeps the paperclip and the paste-to-attach path from ever
  // surfacing, regardless of the `coach_ai_image_upload` beta flag or platform;
  // the server also rejects any image payload (api/coach-ai/stream) so a stale
  // client can't reach the costly vision call. The original platform/flag
  // conditions are kept so flipping the master switch restores prior behavior.
  const platform = useNativePlatform();
  const imageInputEnabled =
    COACH_CAL_IMAGE_UPLOADS_ENABLED && imageUploadAvailable && platform !== "android";
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [partialText, setPartialText] = useState("");
  const [toolCallsDuringStream, setToolCallsDuringStream] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outOfBudget, setOutOfBudget] = useState<OutOfBudgetPayload | null>(null);
  const [packCheckoutPending, setPackCheckoutPending] = useState(false);
  const [usageTick, setUsageTick] = useState(0);
  const [feedbackOptIn, setFeedbackOptIn] = useState<"loading" | "consenting" | "declined" | "unanswered">("loading");
  const [optInPending, setOptInPending] = useState(false);
  const [upgradeBannerEnabled, setUpgradeBannerEnabled] = useState(false);
  // Set when the server reports an in-flight assistant turn for this thread
  // (typically because the coach closed the window mid-stream and reopened).
  // While set, a polling effect drives the visible "thinking" indicator and
  // appends the finished assistant turn to history when status flips to done.
  const [pollingRunningTurnId, setPollingRunningTurnId] = useState<string | null>(null);
  // Distinguishes WHY polling was kicked off. "resume" = the initial-mount
  // hydration saw a running turn from a prior session (e.g. coach closed
  // and reopened the window mid-response). "continue" = the SSE connection
  // for the CURRENT submission dropped mid-stream while the server is
  // still processing (common on image-upload turns where the full pass-1
  // + pass-2 + auto-save can exceed 30s of SSE keepalive). The status
  // text picks based on this — "Picking up where Cal left off…" reads
  // wrong when the coach just hit send 20 seconds ago.
  const [pollingReason, setPollingReason] = useState<"resume" | "continue" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Index of the user turn added by the most recent send() call — receives
  // the .msg-in animation. Null for history turns loaded from localStorage.
  const nextFreshIdxRef = useRef<number | null>(null);
  // Tracks whether the user is "stuck to bottom" (within a small tolerance).
  // We only auto-scroll while this is true. The instant the user scrolls up
  // mid-stream to read something, this flips false and we stop dragging
  // them back down — until their next submit, which re-pins to bottom.
  const stuckToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const prevStorageKeyRef = useRef<string | null>(null);
  // Tracks the playId in scope when the chat last loaded/bridged. We compare
  // against the current playId to detect navigation between plays in the same
  // playbook, which the storageKey-keyed effect can't see (the key doesn't
  // include playId so cross-play navigation within a playbook is invisible to
  // it). Without this, Cal's prior responses about Play A leak into a
  // conversation about Play B and the model conflates their personnel.
  const prevPlayIdInScopeRef = useRef<{ storageKey: string; playId: string | null } | null>(null);
  // Set when Cal's just-completed turn called `create_playbook` from a lobby
  // session. The done handler stamps the new playbook id here and calls
  // router.replace so the launcher re-anchors in place; the storageKey effect
  // below consumes the ref to migrate localStorage from global → new scope
  // without spawning a fresh thread (which would orphan the in-flight
  // conversation under the lobby key and leave the new playbook page empty).
  const autoAnchorTargetRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Determine which context the chat is opened in, so the starter prompt
  // sampler can weight current-view-relevant prompts higher than global ones.
  const currentContext: PromptContext = useMemo(() => {
    if (playId) return "play";
    if (pathname?.startsWith("/calendar")) return "calendar";
    if (pathname?.includes("/roster")) return "roster";
    if (playbookId) return "playbook";
    return "global";
  }, [playId, playbookId, pathname]);

  // Sample once per context change. Stable across re-renders within a context
  // so the chips don't shuffle while the user is reading them, but refresh
  // when the user navigates to a new view (a coach who clicks into a play
  // sees play-relevant prompts; back out to playbook, sees playbook ones).
  const starterPrompts = useMemo<SuggestedPrompt[]>(
    () =>
      pickStarterPrompts({
        audience: "coach",
        context: currentContext,
        enabledFlags: new Set(),
        count: 5,
      }),
    [currentContext],
  );

  // Load the user's AI-feedback opt-in status once. NULL → show modal on
  // first chat use; true/false → never show again. Only entitled users
  // ever reach this surface (the launcher routes free users to a marketing
  // popover instead of opening the chat), so this consent prompt never
  // interrupts someone who hasn't actually started using Coach Cal.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getAiFeedbackOptInAction();
      if (cancelled) return;
      setFeedbackOptIn(res.ok ? res.status : "declined");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getCoachCalUpgradeBannerEnabledAction();
      if (cancelled) return;
      if (res.ok) setUpgradeBannerEnabled(res.enabled);
    })();
    return () => { cancelled = true; };
  }, []);

  async function answerOptIn(consenting: boolean) {
    setOptInPending(true);
    const res = await setAiFeedbackOptInAction(consenting);
    setOptInPending(false);
    if (res.ok) setFeedbackOptIn(consenting ? "consenting" : "declined");
  }

  // Auto-scroll only while the user is stuck to the bottom. The moment
  // they scroll up to read something mid-stream, stuckToBottomRef flips
  // false (via the onScroll handler on the scroll container) and we stop
  // forcing them back down. The next user submit re-pins to bottom (see
  // the submit handler).
  //
  // Two scroll modes:
  //   - SMOOTH on discrete events (new turn appended, stream just ended)
  //     so a coach has a beat to track that something landed instead of
  //     experiencing a jump-cut.
  //   - INSTANT on streaming token growth — smooth-scroll on every token
  //     update would coalesce into visible jank at 30+ fps. The diffs
  //     between tokens are small enough that instant is imperceptible.
  const prevTurnsLenRef = useRef(turns.length);
  const prevStreamingRef = useRef(streaming);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const turnsGrew = turns.length > prevTurnsLenRef.current;
    const streamingEnded = prevStreamingRef.current && !streaming;
    prevTurnsLenRef.current = turns.length;
    prevStreamingRef.current = streaming;
    if (!stuckToBottomRef.current) return;
    if (turnsGrew || streamingEnded) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns, streaming, partialText, statusText]);

  useEffect(() => {
    // Auto-anchor migration: Cal's previous turn called `create_playbook`
    // from a lobby session, and the done handler called router.replace to
    // this playbook. Move the in-progress thread from the global key to
    // the new playbook's key (the save effect below will keep it in sync
    // from here on). No "context switch" bridge — this is a planned
    // hand-off, not a coach manually jumping playbooks.
    if (autoAnchorTargetRef.current && autoAnchorTargetRef.current === playbookId) {
      autoAnchorTargetRef.current = null;
      const globalKey = storageKeyFor(mode, null);
      const migrated = loadTurns(globalKey);
      if (migrated.length > 0) {
        saveTurns(storageKey, migrated);
        try { window.localStorage.removeItem(globalKey); } catch { /* ignore */ }
        try { window.localStorage.removeItem(lastPlayKeyFor(globalKey)); } catch { /* ignore */ }
      }
      setError(null);
      prevStorageKeyRef.current = storageKey;
      prevPlayIdInScopeRef.current = { storageKey, playId: playId ?? null };
      saveLastPlayId(storageKey, playId ?? null);
      return;
    }
    // If the user navigated here via a Cal playbook button (cal_from=1),
    // carry over the global conversation so context isn't lost.
    const params = new URLSearchParams(window.location.search);
    if (params.get("cal_from") === "1") {
      const globalKey = storageKeyFor("normal", null);
      const carried = loadTurns(globalKey);
      const teamName = params.get("cal_team") ?? null;
      params.delete("cal_from");
      params.delete("cal_team");
      const newUrl = window.location.pathname + (params.size > 0 ? "?" + params.toString() : "");
      window.history.replaceState(null, "", newUrl);
      if (carried.length > 0) {
        // Quote the user's last message so they can pick up where they
        // left off without re-typing — e.g. "show me a new mesh concept play".
        const lastUserMsg = [...carried].reverse().find((t) => t.role === "user")?.text ?? null;
        const quoted = lastUserMsg
          ? lastUserMsg.length > 120
            ? `${lastUserMsg.slice(0, 117)}…`
            : lastUserMsg
          : null;
        const bridgeTurn: CoachAiTurn = {
          role: "assistant",
          text: teamName
            ? quoted
              ? `Got it — I'm now in your **${teamName}** playbook. Re-ask "${quoted}" and I'll answer for the right format (variant, age tier, league).`
              : `Got it — I'm now in your **${teamName}** playbook. What can I help with?`
            : quoted
            ? `Got it — I'm now in this playbook. Re-ask "${quoted}" and I'll answer for the right format.`
            : "Got it — I'm now in this playbook. What can I help with?",
          toolCalls: [],
        };
        const merged = [...carried, bridgeTurn];
        setTurns(merged);
        saveTurns(storageKey, merged);
        setError(null);
        prevStorageKeyRef.current = storageKey;
        prevPlayIdInScopeRef.current = { storageKey, playId: playId ?? null };
        saveLastPlayId(storageKey, playId ?? null);
        return;
      }
    }
    const loaded = loadTurns(storageKey);
    const prev = prevStorageKeyRef.current;
    const playbookSwitched = prev != null && prev !== storageKey;
    // Cross-play reopen: storageKey is the same as before, but the persisted
    // history was last anchored to a different play. Without this check, a
    // coach who closed Cal on Play A and re-opens on Play B sees Cal still
    // referencing Play A's player names from history.
    const lastPlayId = loadLastPlayId(storageKey);
    const playSwitchedAcrossSession =
      !playbookSwitched && lastPlayId !== (playId ?? null) && loaded.length > 0;

    let bridgeTurn: CoachAiTurn | null = null;
    if (playbookSwitched && loaded.length > 0) {
      bridgeTurn = {
        role: "assistant",
        text:
          "_[Context switch] You've moved to a different playbook. Earlier turns in this thread may have been about another team — verify rules and personnel against the current playbook before applying prior advice._",
        toolCalls: [],
      };
    } else if (playSwitchedAcrossSession) {
      bridgeTurn = {
        role: "assistant",
        text: playId
          ? "_[Context switch] You're now viewing a different play. Earlier turns in this thread were about a different play — use the diagram in the system prompt for the current play as the source of truth for personnel, routes, and player names._"
          : "_[Context switch] You've navigated away from the play view. Earlier turns in this thread were about a specific play — re-state the play if you need advice about it._",
        toolCalls: [],
      };
    }

    if (bridgeTurn) {
      const merged = [...loaded, bridgeTurn];
      setTurns(merged);
      saveTurns(storageKey, merged);
    } else {
      setTurns(loaded);
    }
    setError(null);
    prevStorageKeyRef.current = storageKey;
    prevPlayIdInScopeRef.current = { storageKey, playId: playId ?? null };
    saveLastPlayId(storageKey, playId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Detect mid-session navigation between plays in the SAME playbook.
  // The storageKey effect above won't see this because the storage key only
  // includes the playbook (not the play id). Without this bridge, prior
  // assistant turns about Play A leak into a conversation about Play B and
  // Cal mixes their personnel/routes (surfaced 2026-05-04: a coach saw Cal
  // reference renamed players from a different play in the same playbook).
  useEffect(() => {
    const prev = prevPlayIdInScopeRef.current;
    prevPlayIdInScopeRef.current = { storageKey, playId: playId ?? null };
    saveLastPlayId(storageKey, playId ?? null);
    // First fire after mount (or after the storageKey effect just ran) — the
    // storageKey effect already handled the cross-scope bridge if needed.
    if (!prev) return;
    if (prev.storageKey !== storageKey) return;
    if (prev.playId === (playId ?? null)) return;

    // Same playbook, different play. Append a bridge turn to the live state
    // (don't reload from storage — a stream may be in flight).
    setTurns((cur) => {
      if (cur.length === 0) return cur;
      const last = cur[cur.length - 1];
      // Avoid double-bridge if a context-switch is already the last turn.
      if (last?.role === "assistant" && last.text.includes("[Context switch]")) return cur;
      const bridge: CoachAiTurn = {
        role: "assistant",
        text: playId
          ? "_[Context switch] You're now viewing a different play. Earlier turns in this thread were about a different play — use the diagram in the system prompt for the current play as the source of truth for personnel, routes, and player names._"
          : "_[Context switch] You've navigated away from the play view. Earlier turns in this thread were about a specific play — re-state the play if you need advice about it._",
        toolCalls: [],
      };
      const merged = [...cur, bridge];
      saveTurns(storageKey, merged);
      return merged;
    });
  }, [playId, storageKey]);

  useEffect(() => {
    saveTurns(storageKey, turns);
  }, [storageKey, turns]);

  // Server hydration: replace any localStorage-derived state with the
  // server's source-of-truth history once available. Runs after the
  // localStorage init effects above so they fill the gap during the
  // round-trip; if the server has zero turns we leave localStorage in
  // place — the next send will backfill it server-side. If the server
  // reports a running turn, kick off polling so the coach sees Cal's
  // reply when it lands even if they closed the original window.
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    void (async () => {
      type ThreadResponse = {
        ok: boolean;
        turns?: CoachAiTurn[];
        runningTurnId?: string | null;
      };
      const qs = new URLSearchParams();
      qs.set("mode", mode);
      if (mode === "normal" && playbookId) qs.set("playbookId", playbookId);
      let data: ThreadResponse | null = null;
      try {
        const res = await fetch(`/api/coach-ai/thread?${qs.toString()}`, { signal: ctrl.signal });
        if (!res.ok) return;
        data = (await res.json()) as ThreadResponse;
      } catch {
        return; // network error — keep localStorage state, retry on next mount
      }
      if (cancelled || !data?.ok) return;
      const serverTurns = data.turns ?? [];
      if (serverTurns.length > 0) {
        setTurns(serverTurns);
        saveTurns(storageKey, serverTurns);
      }
      if (data.runningTurnId) {
        // Resume path: initial mount found a turn from a prior session.
        setPollingReason("resume");
        setPollingRunningTurnId(data.runningTurnId);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Poll a running turn until it completes. Set when (a) the server-hydration
  // effect above sees a running turn from a prior session, or (b) the SSE
  // connection drops mid-stream and we captured a turn_id at the start. The
  // visible "thinking" indicator continues so the coach sees Cal still working.
  useEffect(() => {
    if (!pollingRunningTurnId) return;
    setStreaming(true);
    // Status text reflects why we're polling. "Resume" is the cross-session
    // re-attach case (you closed the window mid-response and reopened);
    // "continue" is the current-turn SSE-timeout case (your request is
    // taking longer than the SSE keepalive — common on image uploads).
    setStatusText(
      pollingReason === "continue"
        ? "Still working on this… (image uploads can take ~30–60s)"
        : "Picking up where Cal left off…",
    );

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    type TurnPollResponse = {
      ok: boolean;
      status?: "running" | "done" | "errored";
      turn?: CoachAiTurn | null;
      mutated?: boolean;
      error?: string | null;
    };

    const poll = async () => {
      if (cancelled) return;
      let data: TurnPollResponse | null = null;
      try {
        const res = await fetch(`/api/coach-ai/turn/${pollingRunningTurnId}`);
        if (!res.ok) {
          timeout = setTimeout(poll, 2500);
          return;
        }
        data = (await res.json()) as TurnPollResponse;
      } catch {
        timeout = setTimeout(poll, 2500);
        return;
      }
      if (cancelled) return;
      if (!data?.ok) {
        timeout = setTimeout(poll, 2500);
        return;
      }
      if (data.status === "done") {
        const finishedTurn = data.turn;
        if (finishedTurn) {
          setTurns((cur) => {
            const next = [...cur, finishedTurn];
            saveTurns(storageKey, next);
            return next;
          });
        }
        // Same auto-anchor handoff as the SSE done path (see comment there).
        // Polling delivers the same turn payload as the live stream, so the
        // create_playbook detection works identically. Narrow to the
        // assistant variant — only assistant turns carry toolCalls, and a
        // poll-completion turn is always assistant by construction.
        const autoAnchorId = finishedTurn && finishedTurn.role === "assistant"
          ? detectAutoAnchorTarget(playbookId, mode, finishedTurn.toolCalls, finishedTurn.text)
          : null;
        if (autoAnchorId) {
          autoAnchorTargetRef.current = autoAnchorId;
          router.replace(`/playbooks/${autoAnchorId}`);
        } else if (data.mutated) {
          router.refresh();
        }
        if ((data.mutated || autoAnchorId) && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("coach-ai-mutated"));
        }
        setStreaming(false);
        setStatusText(null);
        setPartialText("");
        setToolCallsDuringStream([]);
        setUsageTick((n) => n + 1);
        setPollingRunningTurnId(null);
        setPollingReason(null);
        return;
      }
      if (data.status === "errored") {
        setError(data.error ?? "Coach Cal didn't finish in time. Try again.");
        setStreaming(false);
        setStatusText(null);
        setPartialText("");
        setToolCallsDuringStream([]);
        setPollingRunningTurnId(null);
        setPollingReason(null);
        return;
      }
      // Still running — schedule the next poll. 1.5s strikes a balance
      // between snappy reveal when Cal lands and not hammering the row.
      timeout = setTimeout(poll, 1500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [pollingRunningTurnId, storageKey, router, playbookId, mode]);

  function clearChat() {
    // Abort any in-flight stream — otherwise the SSE consumer keeps
    // reading until the server closes, and on a hung/disconnected
    // stream that means the loading overlay (the "thinking" pulse)
    // stays up forever masking what was already rendered. Surfaced
    // 2026-05-02: a coach hit Clear during a stuck stream and saw
    // the diagram pop in because the underlying turn HAD completed —
    // only the streaming UI state hadn't cleared.
    abortRef.current?.abort();
    abortRef.current = null;
    // Stop any reconnect-poll loop too. The unmount-cleanup in the
    // poll effect won't fire on its own because we're not unmounting,
    // just nulling the id which the effect's setter is keyed on.
    setPollingRunningTurnId(null);
    setPollingReason(null);
    setStreaming(false);
    setPartialText("");
    setStatusText(null);
    setToolCallsDuringStream([]);
    setTurns([]);
    setError(null);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
      saveLastPlayId(storageKey, playId ?? null);
    }
    // Server-side wipe — fire-and-forget. If it fails the local clear
    // still feels right to the coach; on next mount the server thread
    // will re-hydrate and any not-yet-cleared turns will reappear.
    void fetch("/api/coach-ai/thread/clear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        playbookId: mode === "admin_training" ? null : (playbookId ?? null),
      }),
    }).catch(() => { /* non-critical */ });
  }

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    // Pending image goes with the current turn — programmatic sends
    // (suggested prompts) and typed sends both pull from the same slot.
    const image = pendingImage;
    if ((!text && !image) || streaming) return;
    setError(null);
    setOutOfBudget(null);
    setStatusText(null);
    setPartialText("");
    setToolCallsDuringStream([]);

    // Bubble text mirrors what the server persists (see route.ts
    // persistedUserText) so the optimistic in-session bubble matches the
    // post-refresh bubble — including the "📎 <name>" attachment indicator
    // when an image was attached.
    const imageName = image?.name?.trim() || (image ? "attached image" : null);
    const imageSuffix = imageName ? `\n\n📎 ${imageName}` : "";
    const bubbleText = text
      ? `${text}${imageSuffix}`
      : imageName
        ? `📎 ${imageName}`
        : "[image attached]";
    const userTurn: CoachAiTurn = { role: "user", text: bubbleText };
    const prior = turns;
    nextFreshIdxRef.current = turns.length;
    setTurns((cur) => [...cur, userTurn]);
    setDraft("");
    setPendingImage(null);
    setStreaming(true);
    // The user just submitted — re-pin to bottom so they see their own
    // message and the streaming reply, even if they had scrolled up to
    // re-read an earlier diagram while drafting. (Once Cal starts
    // generating, the onScroll handler takes over: scroll up = stop
    // dragging them down.)
    stuckToBottomRef.current = true;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Lifted out of try so the finally block can preserve any partial text
    // when the coach hits Stop mid-stream.
    let accumulated = "";
    let blocked = false;
    let savedFinalTurn = false;
    const seenToolCalls: string[] = [];
    // The server's first SSE frame is a `turn_id` event identifying the
    // detached agent run. If the SSE connection drops before `done`, we
    // hand this id off to the polling effect so the coach still sees the
    // result when it lands.
    let capturedTurnId: string | null = null;

    // Idle watchdog: if no SSE chunk arrives for IDLE_TIMEOUT_MS, the
    // underlying TCP connection is almost certainly dead (laptop slept,
    // server restart, network blip). The browser's `reader.read()` won't
    // throw in that case — it just stays pending forever. We force the
    // issue by aborting the controller, which surfaces as an AbortError
    // in the catch block below; the watchdogFired flag tells that handler
    // to pivot to polling (using capturedTurnId) instead of treating the
    // abort as user-initiated. Re-checked eagerly on tab resume since
    // background timers are heavily throttled while the tab is hidden.
    const IDLE_TIMEOUT_MS = 30_000;
    let lastChunkAt = Date.now();
    let watchdogFired = false;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    const tripWatchdog = () => {
      if (watchdogFired) return true;
      if (Date.now() - lastChunkAt > IDLE_TIMEOUT_MS) {
        watchdogFired = true;
        try { ctrl.abort(); } catch { /* ignore */ }
        return true;
      }
      return false;
    };
    const armWatchdog = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        if (!tripWatchdog()) armWatchdog();
      }, IDLE_TIMEOUT_MS);
    };
    const onVisibilityForWatchdog = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!tripWatchdog()) armWatchdog();
    };
    armWatchdog();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityForWatchdog);
    }

    // The editor publishes its in-memory doc to a window-level store (see
    // live-play-doc.ts) so Cal can see edits that the autosave debounce hasn't
    // persisted yet. Without this, asking Cal a question mid-edit (e.g. while
    // a player is selected — the autosave safety net is 30s) reads the
    // pre-edit version_id from Postgres and Cal "corrects" the coach with
    // stale data.
    const livePlayDoc = playId ? readLivePlayDoc(playId) : null;

    try {
      const res = await fetch("/api/coach-ai/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          history: prior,
          userMessage: text,
          playbookId,
          playId,
          livePlayDoc,
          mode,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(image ? { userImage: { mediaType: image.mediaType, base64: image.base64, name: image.name } } : {}),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      for await (const { event, data } of parseSse(res.body)) {
        if (ctrl.signal.aborted) break;
        // Reset the idle watchdog on every frame so a healthy stream with
        // sparse text (long tool runs, slow model) never trips it.
        lastChunkAt = Date.now();
        armWatchdog();
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(data) as Record<string, unknown>; } catch { continue; }

        if (event === "turn_id") {
          capturedTurnId = (payload.id as string | undefined) ?? null;
        }
        if (event === "status")     setStatusText(payload.text as string);
        if (event === "tool_call") {
          const name = payload.name as string;
          seenToolCalls.push(name);
          setToolCallsDuringStream([...seenToolCalls]);
        }
        if (event === "text_delta") {
          accumulated += payload.text as string;
          setPartialText(accumulated);
          setStatusText(null); // clear "Searching…" once text starts
        }
        if (event === "error") {
          if (payload.code === "out_of_budget") {
            blocked = true;
            setOutOfBudget({
              window: (payload.window as OutOfBudgetPayload["window"]) ?? "month",
              resetAt: (payload.resetAt as string | null) ?? null,
              pack: payload.pack as OutOfBudgetPayload["pack"],
            });
            // Roll back the optimistically-appended user turn so it
            // doesn't sit there as if it was sent.
            setTurns((cur) => (cur.at(-1)?.role === "user" ? cur.slice(0, -1) : cur));
            setDraft(text);
          } else if (payload.code === "out_of_image_uploads") {
            // Image-only cap. No pack-purchase upsell — just an honest
            // "limit resets on YYYY-MM-DD" via the server's message. Roll
            // back the optimistic turn + restore the typed text. The image
            // attachment itself isn't re-restored (it was cleared in send
            // and we don't keep a buffer); coach has to re-attach next
            // month or use a text-only message now.
            blocked = true;
            setError((payload.message as string | undefined) ?? "Image upload limit reached.");
            setTurns((cur) => (cur.at(-1)?.role === "user" ? cur.slice(0, -1) : cur));
            setDraft(text);
          } else {
            setError((payload.message as string | undefined) ?? "An error occurred.");
          }
        }
        if (event === "done") {
          if (blocked) {
            break;
          }
          const finalText = (payload.text as string | undefined) || accumulated;
          const finalToolCalls = (payload.toolCalls as string[] | undefined) ?? seenToolCalls;
          const chips = (payload.playbookChips as PlaybookChip[] | null | undefined) ?? null;
          const proposals = (payload.noteProposals as NoteProposal[] | null | undefined) ?? null;
          const defenseProposals = (payload.saveDefenseProposals as SaveDefenseProposal[] | null | undefined) ?? null;
          const mutated = payload.mutated === true;
          setTurns((cur) => [
            ...cur,
            {
              role: "assistant",
              text: finalText,
              toolCalls: finalToolCalls,
              playbookChips: chips,
              noteProposals: proposals,
              noteProposalState: null,
              saveDefenseProposals: defenseProposals,
              saveDefenseProposalState: null,
            },
          ]);
          savedFinalTurn = true;
          setUsageTick((n) => n + 1);
          // Auto-anchor: when Cal just created a playbook from a lobby
          // session, navigate the live panel to the new playbook in place
          // so the in-flight conversation continues there instead of being
          // orphaned under the global key. The storageKey effect consumes
          // `autoAnchorTargetRef` once the URL change propagates. We skip
          // router.refresh here because router.replace already triggers a
          // server-component re-fetch on the destination route.
          const autoAnchorId = detectAutoAnchorTarget(playbookId, mode, finalToolCalls, finalText);
          if (autoAnchorId) {
            autoAnchorTargetRef.current = autoAnchorId;
            router.replace(`/playbooks/${autoAnchorId}`);
          } else if (mutated) {
            // If the agent ran any DB-mutating tool (create_event, update_play,
            // KB writes, etc.), refresh the surrounding page so newly created
            // rows appear without a manual reload. router.refresh re-runs the
            // server components for the current route — cheap, no full reload,
            // and leaves the chat panel mounted.
            router.refresh();
          }
          // Broadcast so client-only views that fetch their own data (e.g.
          // the calendar tab, the playbook list dropdown) can reload without
          // waiting for a manual refresh. Fires for both auto-anchor and
          // ordinary mutations since both produce new server state.
          if ((mutated || autoAnchorId) && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("coach-ai-mutated"));
          }
          // The SSE delivered a clean `done` — no need to fall back to
          // polling on the same turn id.
          capturedTurnId = null;
          break;
        }
      }
      // The SSE ended without a `done` frame (network blip, server
      // restart, etc.) but we have a turn id — pivot to polling so the
      // coach still gets the answer Cal is finishing server-side.
      if (!savedFinalTurn && !blocked && capturedTurnId && !ctrl.signal.aborted) {
        setPollingReason("continue");
        setPollingRunningTurnId(capturedTurnId);
        capturedTurnId = null;
      }
    } catch (e) {
      const isAbort = (e as { name?: string }).name === "AbortError";
      if (isAbort && watchdogFired) {
        // The watchdog tripped — the SSE socket was almost certainly dead
        // (slept laptop, server restart, dropped network). The agent is
        // detached on the server, so hand off to polling if we know which
        // turn to ask about; otherwise surface a retry-friendly error.
        if (!savedFinalTurn && capturedTurnId) {
          setPollingReason("continue");
          setPollingRunningTurnId(capturedTurnId);
          capturedTurnId = null;
        } else if (!savedFinalTurn) {
          setError("Coach Cal's response stalled. Please try again.");
        }
      } else if (!isAbort) {
        // Mid-stream connection failure with a known turn id → let the
        // polling effect deliver the result rather than surface an error
        // for a turn that's almost certainly going to complete.
        if (!savedFinalTurn && capturedTurnId) {
          setPollingReason("continue");
          setPollingRunningTurnId(capturedTurnId);
          capturedTurnId = null;
        } else {
          setError(e instanceof Error ? e.message : "Coach Cal request failed.");
        }
      }
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityForWatchdog);
      }
      // If the coach hit Stop mid-stream, preserve whatever Cal had already
      // streamed as a real assistant turn — same convention as ChatGPT /
      // Claude.ai. Skip when clearChat() did the abort (it nulls the ref
      // before the SSE loop notices), since clearing turns and then re-
      // appending one would be wrong.
      if (
        !savedFinalTurn &&
        ctrl.signal.aborted &&
        accumulated.trim() &&
        abortRef.current === ctrl
      ) {
        setTurns((cur) => [
          ...cur,
          {
            role: "assistant",
            text: accumulated,
            toolCalls: seenToolCalls,
            playbookChips: null,
            noteProposals: null,
            noteProposalState: null,
          },
        ]);
      }
      setStreaming(false);
      setStatusText(null);
      setPartialText("");
      setToolCallsDuringStream([]);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [draft, streaming, turns, playbookId, playId, mode, router]);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Externally-injected prompt (in-app CTA). When the key changes, drop the
  // text into the draft and — if the CTA wanted it sent — fire send() with
  // the explicit text so we don't depend on a same-tick state update having
  // landed. Includes the key in the deps so a *repeat* click of the same
  // CTA re-injects (the openCoachCal helper bumps the key on every dispatch).
  const injectedKey = injectedPrompt?.key ?? null;
  useEffect(() => {
    if (!injectedPrompt) return;
    setDraft(injectedPrompt.text);
    if (injectedPrompt.autoSubmit) {
      void send(injectedPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedKey]);

  const buyMessagePack = useCallback(async () => {
    setPackCheckoutPending(true);
    try {
      const res = await createMessagePackCheckoutAction();
      if (!res.ok) {
        setError(res.error);
        setOutOfBudget(null);
        return;
      }
      window.location.href = res.url;
    } finally {
      setPackCheckoutPending(false);
    }
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {feedbackOptIn === "unanswered" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl ring-1 ring-black/10">
            <h3 className="text-base font-semibold text-foreground">Help improve Coach Cal?</h3>
            <p className="mt-2 text-sm text-muted">
              When Coach Cal answers from general football knowledge instead of our seeded playbook,
              we&apos;d like to log the topic of your question so we can fill that gap. We never log
              your full chat — just the topic + your question + a few details about your playbook
              context.
            </p>
            <p className="mt-2 text-sm text-muted">
              You can change your mind anytime — just ask Coach Cal to update your feedback
              preference. Details in our{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                privacy policy
              </a>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={optInPending} onClick={() => void answerOptIn(false)}>
                No thanks
              </Button>
              <Button variant="primary" size="sm" disabled={optInPending} onClick={() => void answerOptIn(true)}>
                Help improve
              </Button>
            </div>
          </div>
        </div>
      )}
      {upgradeBannerEnabled && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            <span className="font-semibold">Coach Cal is being upgraded.</span>{" "}
            He&rsquo;s still available, but you may notice unusual behavior
            while improvements roll out. Thanks for your patience.
          </p>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        onScroll={(e) => {
          // Track whether the user is parked at the bottom. Tolerance of
          // ~24px so a near-bottom position still counts as "stuck"
          // (smooth-scroll lag, sub-pixel rounding). The autoscroll effect
          // checks this ref before forcing scrollTop to scrollHeight.
          const el = e.currentTarget;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          stuckToBottomRef.current = distFromBottom <= 24;
        }}
      >
        {turns.length === 0 && !streaming ? (
          <Empty
            prompts={starterPrompts}
            onSelectPrompt={(text) => {
              setDraft(text);
              // Keep the focus + caret behavior — coaches can keep
              // typing to extend the prompt before sending.
              requestAnimationFrame(() => {
                const ta = document.querySelector<HTMLTextAreaElement>(
                  "[data-coach-ai-input]",
                );
                if (ta) {
                  ta.focus();
                  ta.setSelectionRange(text.length, text.length);
                }
              });
            }}
          />
        ) : (
          <ul className="space-y-5">
            {turns.map((t, i) => {
              const prevUserMessage = i > 0 ? turns[i - 1]?.text : "";
              return (
                <li key={i} className={t.role === "user" ? "flex justify-end" : "flex items-start gap-2.5"}>
                  {t.role === "assistant" && (
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CoachAiIcon className="size-4 text-primary" bare />
                    </div>
                  )}
                  {t.role === "user" ? (
                    <UserMessageBubble text={t.text} animate={i === nextFreshIdxRef.current} />
                  ) : (
                    <div className="min-w-0 flex-1">
                      {t.role === "assistant" && t.playbookChips && t.playbookChips.length > 0 && (
                        <div className="mb-2 flex flex-col gap-1.5">
                          {t.playbookChips.map((pb) => (
                            <Link
                              key={pb.id}
                              href={`/playbooks/${pb.id}?cal_from=1&cal_team=${encodeURIComponent(pb.name)}`}
                              style={{ backgroundColor: pb.color ?? "#134e2a" }}
                              className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
                            >
                              {[pb.name, pb.season].filter(Boolean).join(" · ")}
                            </Link>
                          ))}
                        </div>
                      )}
                      <AssistantMessageWithFeedback
                        text={t.text}
                        isAdmin={isAdmin}
                        onThumbsUp={() =>
                          void logCoachAiPositiveFeedbackAction(t.text, prevUserMessage)
                        }
                        onThumbsDown={() =>
                          void logCoachAiNegativeFeedbackAction(t.text, prevUserMessage)
                        }
                      />
                      {t.role === "assistant" && t.noteProposals && t.noteProposals.length > 0 && playbookId && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {t.noteProposals.map((p) => (
                            <NoteProposalChip
                              key={p.proposalId}
                              proposal={p}
                              playbookId={playbookId}
                              state={t.noteProposalState?.[p.proposalId] ?? null}
                              onUpdate={(next) =>
                                setTurns((cur) =>
                                  cur.map((tt, j) =>
                                    j === i && tt.role === "assistant"
                                      ? {
                                          ...tt,
                                          noteProposalState: {
                                            ...(tt.noteProposalState ?? {}),
                                            [p.proposalId]: next,
                                          },
                                        }
                                      : tt,
                                  ),
                                )
                              }
                            />
                          ))}
                        </div>
                      )}
                      {t.role === "assistant" && t.saveDefenseProposals && t.saveDefenseProposals.length > 0 && playbookId && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {t.saveDefenseProposals.map((p) => (
                            <SaveDefensePlayChip
                              key={p.proposalId}
                              proposal={p}
                              playbookId={playbookId}
                              state={t.saveDefenseProposalState?.[p.proposalId] ?? null}
                              onUpdate={(next) =>
                                setTurns((cur) =>
                                  cur.map((tt, j) =>
                                    j === i && tt.role === "assistant"
                                      ? {
                                          ...tt,
                                          saveDefenseProposalState: {
                                            ...(tt.saveDefenseProposalState ?? {}),
                                            [p.proposalId]: next,
                                          },
                                        }
                                      : tt,
                                  ),
                                )
                              }
                            />
                          ))}
                        </div>
                      )}
                      {t.toolCalls.length > 0 && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted">
                          <Wrench className="size-3" />
                          {t.toolCalls.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}

            {/* Live streaming turn */}
            {streaming && (
              <li className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CoachAiIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {partialText ? (
                    <>
                      <AssistantMessage text={partialText} />
                      <span className="mt-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-primary/60 align-middle" />
                    </>
                  ) : (
                    <div className="flex items-center gap-2 py-1 text-sm text-muted">
                      <Dots />
                      {statusText && (
                        <span className="text-[12px] italic">{statusText}</span>
                      )}
                    </div>
                  )}
                  {toolCallsDuringStream.length > 0 && !partialText && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                      <Wrench className="size-3" />
                      {toolCallsDuringStream.join(", ")}
                    </div>
                  )}
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {outOfBudget && (
        <div className="mx-3 mb-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
          {outOfBudget.window === "month" ? (
            <>
              <p className="font-semibold">
                You&rsquo;ve reached this month&rsquo;s Coach Cal limit.
              </p>
              <p className="mt-1 text-amber-800/90 dark:text-amber-100/90">
                Resets {formatBudgetReset(outOfBudget.resetAt)}.
                {outOfBudget.pack.priceConfigured
                  ? ` Need more before then? Top up for ${formatPackPriceCents(outOfBudget.pack.priceUsdCents)}.`
                  : " Need more before then? Get in touch and we'll sort you out."}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {outOfBudget.pack.priceConfigured ? (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={packCheckoutPending}
                    disabled={packCheckoutPending}
                    onClick={() => void buyMessagePack()}
                  >
                    Top up for {formatPackPriceCents(outOfBudget.pack.priceUsdCents)}
                  </Button>
                ) : (
                  <Link
                    href="/contact"
                    className="inline-flex items-center rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-950 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
                  >
                    Get in touch
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setOutOfBudget(null)}
                  className="text-xs font-medium text-amber-900/70 hover:underline dark:text-amber-100/70"
                >
                  I&rsquo;ll wait
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-semibold">Coach Cal needs a short break.</p>
              <p className="mt-1 text-amber-800/90 dark:text-amber-100/90">
                You&rsquo;ve sent a lot in a short window. Try again{" "}
                {formatBudgetReset(outOfBudget.resetAt)}.
              </p>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setOutOfBudget(null)}
                  className="text-xs font-medium text-amber-900/70 hover:underline dark:text-amber-100/70"
                >
                  Got it
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="border-t border-border bg-surface-raised px-3 pb-3 pt-2">
        {imageInputEnabled && pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-inset px-2 py-1.5 ring-1 ring-inset ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview, no Next/Image needed */}
            <img
              src={pendingImage.preview}
              alt="Attached"
              className="size-12 rounded object-cover"
            />
            <div className="flex-1 text-xs leading-snug text-muted">
              Image attached to next message. Not saved &mdash; Cal will see it once.
            </div>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
              aria-label="Remove image"
              title="Remove image"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {imageInputEnabled && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              // Reset value so picking the same file twice in a row still fires onChange.
              e.target.value = "";
              if (!file) return;
              try {
                const img = await prepareImageForUpload(file);
                setPendingImage(img);
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't load image.");
              }
            }}
          />
        )}
        <div className="flex items-end gap-2">
          {imageInputEnabled && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || pendingImage !== null}
              className="mb-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-inset hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Attach image"
              title={pendingImage ? "Remove the current image first" : "Attach an image (play sheet, wristcoach, whiteboard)"}
            >
              <Paperclip className="size-4" />
            </button>
          )}
          <textarea
            rows={2}
            data-coach-ai-input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={async (e) => {
              // Clipboard images (screenshot, copied photo) become an
              // attachment, not pasted text. Coaches commonly paste from the
              // OS screenshot tool — handle it here rather than forcing them
              // through the file picker. Skipped on Android (image input
              // disabled — see imageInputEnabled comment) so a pasted image
              // doesn't silently end up in a state the UI can't surface.
              if (!imageInputEnabled) return;
              const items = Array.from(e.clipboardData?.items ?? []);
              const imageItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
              if (!imageItem) return;
              e.preventDefault();
              const file = imageItem.getAsFile();
              if (!file) return;
              try {
                const img = await prepareImageForUpload(file);
                setPendingImage(img);
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't load image.");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) void send();
              }
            }}
            placeholder={
              streaming
                ? "Type your next message…"
                : pendingImage
                  ? "Add a note for Cal, or send the image as-is…"
                  : "Ask Coach Cal…"
            }
            className="flex-1 resize-none rounded-xl bg-surface-inset px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {streaming ? (
            <Button
              variant="primary"
              size="sm"
              onClick={stopStream}
              aria-label="Stop"
              title="Stop"
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={(!draft.trim() && !pendingImage) || outOfBudget !== null}
              onClick={() => void send()}
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="truncate text-[11px] leading-snug text-muted">
              Coach Cal may be wrong — double-check rules against the official source.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CoachCalCostMeter refreshTick={usageTick} />
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => { if (confirm("Clear this chat? History will be erased.")) clearChat(); }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground"
                title="Clear chat history"
              >
                <Trash2 className="size-3" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserMessageBubble({ text, animate }: { text: string; animate?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail — same fallback as the assistant copy button.
    }
  }
  return (
    <div className={`flex max-w-[82%] flex-col items-end gap-1${animate ? " msg-in" : ""}`}>
      <div className="whitespace-pre-line rounded-2xl rounded-tr-sm bg-brand-green px-3.5 py-2 text-sm leading-relaxed text-white">
        {text}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy message"}
        aria-label={copied ? "Copied" : "Copy message"}
        className="inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function Empty({
  prompts,
  onSelectPrompt,
}: {
  prompts: SuggestedPrompt[];
  onSelectPrompt: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      {/* Standalone mark — icon ships its own gradient tile. */}
      <CoachAiIcon className="size-12" />
      <h3 className="mt-3 text-base font-semibold text-foreground">Coach Cal</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Generate plays and playbooks, plan practices and seasons, review games,
        and get strategy vs. any defense — all from a single chat.
      </p>
      <ul className="mt-4 flex w-full max-w-sm flex-col gap-1.5">
        {prompts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelectPrompt(p.text)}
              className="w-full rounded-lg bg-surface-inset px-3 py-2 text-left text-xs text-foreground hover:bg-surface-inset/80"
            >
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoteProposalChip({
  proposal,
  playbookId,
  state,
  onUpdate,
}: {
  proposal: NoteProposal;
  playbookId: string;
  state: NoteProposalSavedState | null;
  onUpdate: (next: NoteProposalSavedState) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headline =
    proposal.kind === "add"
      ? proposal.title
      : proposal.kind === "edit"
        ? `Edit: ${proposal.after.title}`
        : `Retire: ${proposal.snapshot.title}`;

  const subline =
    proposal.kind === "add"
      ? proposal.content.length > 140
        ? `${proposal.content.slice(0, 140).trim()}…`
        : proposal.content
      : proposal.change_summary;

  const action =
    proposal.kind === "add"
      ? "Save to playbook notes"
      : proposal.kind === "edit"
        ? "Save edit"
        : "Retire note";

  async function save() {
    setPending(true);
    setError(null);
    const res = await commitPlaybookNoteProposalAction(playbookId, proposal);
    setPending(false);
    if (res.ok) {
      onUpdate({ status: "saved", documentId: res.documentId, revisionNumber: res.revisionNumber });
    } else {
      setError(res.error);
    }
  }

  if (state?.status === "saved") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
        <Check className="size-3.5 shrink-0" />
        <span className="truncate">
          Saved to playbook notes (rev {state.revisionNumber})
        </span>
      </div>
    );
  }

  if (state?.status === "dismissed") {
    return null;
  }

  return (
    <div className="rounded-lg border border-sky-300 bg-sky-50/60 p-2.5 text-xs ring-1 ring-sky-200/60 dark:border-sky-700 dark:bg-sky-950/30">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 size-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sky-900 dark:text-sky-100">
            {headline}
          </div>
          {subline && (
            <div className="mt-0.5 line-clamp-2 text-sky-800/80 dark:text-sky-200/70">
              {subline}
            </div>
          )}
          {error && (
            <div className="mt-1 text-red-700 dark:text-red-300">{error}</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onUpdate({ status: "dismissed" })}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-sky-900/70 hover:bg-sky-100/60 disabled:opacity-50 dark:text-sky-200/70 dark:hover:bg-sky-900/40"
          title="Dismiss this proposal"
        >
          <X className="size-3" />
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
        >
          <Check className="size-3" />
          {pending ? "Saving…" : action}
        </button>
      </div>
    </div>
  );
}

function SaveDefensePlayChip({
  proposal,
  playbookId,
  state,
  onUpdate,
}: {
  proposal: SaveDefenseProposal;
  playbookId: string;
  state: SaveDefenseProposalState | null;
  onUpdate: (next: SaveDefenseProposalState) => void;
}) {
  // Which button is in-flight, so we can disable both + label the right one.
  const [pending, setPending] = useState<null | "attached" | "new">(null);
  const [error, setError] = useState<string | null>(null);

  async function commit(mode: "attached" | "new") {
    setPending(mode);
    setError(null);
    const res =
      mode === "attached"
        ? await commitAttachDefenseToPlayAction(playbookId, proposal)
        : await commitSaveDefenseProposalAction(playbookId, proposal);
    setPending(null);
    if (res.ok) {
      onUpdate({ status: "saved", mode, playId: res.playId });
    } else {
      setError(res.error);
    }
  }

  if (state?.status === "saved") {
    return (
      <a
        href={`/plays/${state.playId}`}
        className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900"
      >
        <Check className="size-3.5 shrink-0" />
        <span className="truncate">
          {state.mode === "attached"
            ? `Added the defense to ${proposal.offensivePlayName} — open the play`
            : `Saved "${proposal.suggestedName}" — open the new play`}
        </span>
      </a>
    );
  }

  if (state?.status === "dismissed") return null;

  const busy = pending !== null;

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-2.5 text-xs ring-1 ring-emerald-200/60 dark:border-emerald-700 dark:bg-emerald-950/30">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-emerald-900 dark:text-emerald-100">
            Keep this defense? "{proposal.suggestedName}"
          </div>
          <div className="mt-0.5 line-clamp-2 text-emerald-800/80 dark:text-emerald-200/70">
            {proposal.changeSummary} (vs {proposal.offensivePlayName})
          </div>
          {error && (
            <div className="mt-1 text-red-700 dark:text-red-300">{error}</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onUpdate({ status: "dismissed" })}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-900/70 hover:bg-emerald-100/60 disabled:opacity-50 dark:text-emerald-200/70 dark:hover:bg-emerald-900/40"
        >
          <X className="size-3" />
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => void commit("attached")}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
        >
          <Check className="size-3" />
          {pending === "attached" ? "Adding…" : "Add to this play"}
        </button>
        <button
          type="button"
          onClick={() => void commit("new")}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          <Check className="size-3" />
          {pending === "new" ? "Saving…" : "Save as new defense play"}
        </button>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Thinking">
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "0ms" }} />
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "120ms" }} />
      <span className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "240ms" }} />
    </span>
  );
}
