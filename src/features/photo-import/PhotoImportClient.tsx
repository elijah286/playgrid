"use client";

/**
 * Photo play import flow (photo_play_import beta).
 *
 *   pick a photo → detect panels → pick a panel → extraction (LLM) →
 *   REVIEW (photo beside rendered draft, per-route confidence, edit
 *   anything) → save.
 *
 * Two properties carried over from the Phase 0 design work:
 *   - The review step is mandatory. Extraction accuracy in the 90%s
 *     still means ~1 fix per play; the old auto-saving pipeline is why
 *     this feature died in June.
 *   - All preview rendering happens client-side through the SAME
 *     domain renderer the app uses (playSpecToCoachDiagram →
 *     coachDiagramToPlayDocument → PlayDiagramEmbed), so what the
 *     coach approves is byte-for-byte what gets validated and saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardCopy, Loader2, RefreshCw } from "lucide-react";
import type { SportVariant } from "@/domain/play/types";
import type { PlaySpec, PlayerAssignment, AssignmentAction } from "@/domain/play/spec";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { PlayDiagramEmbed } from "@/features/coach-ai/PlayDiagramEmbed";
import type { PlayExtraction } from "@/lib/coach-ai/photo-import/schema";
import {
  applySheetIdentity,
  applyPhotoAlignment,
  SHEET_COLOR_HEX,
  type ImportWarning,
  type PlayerMapping,
} from "@/lib/coach-ai/photo-import/synthesize";

type BBox = { x: number; y: number; w: number; h: number };
type Panel = { label: string; bbox: BBox; thumbBase64: string };
type LoadedImage = { base64: string; mediaType: string; dataUrl: string };

type Phase =
  | { step: "pick" }
  | { step: "detecting" }
  | { step: "panels"; panels: Panel[] }
  | { step: "extracting"; label: string; panels: Panel[] | null }
  | { step: "resuming"; jobId: string }
  | { step: "review" }
  | { step: "saving" };

type VariantMismatchInfo = {
  photoPlayers: number;
  expectedPlayers: number;
  variant: string;
};

type ExtractResponse = {
  jobId?: string | null;
  extraction?: PlayExtraction;
  spec?: PlaySpec;
  mapping?: PlayerMapping[];
  warnings?: ImportWarning[];
  capRemaining: number;
  /** Present when the photographed play's player count doesn't fit
   *  this playbook's format (e.g. a 7v7 sheet in a 5v5 playbook). */
  variantMismatch?: VariantMismatchInfo;
};

type JobSummary = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  hasMismatch: boolean;
  createdAt: string;
  updatedAt: string;
};

type JobFull = JobSummary & {
  cropBase64: string | null;
  mediaType: string | null;
  extraction: PlayExtraction | null;
  spec: PlaySpec | null;
  mapping: PlayerMapping[] | null;
  warnings: ImportWarning[] | null;
  variantMismatch: VariantMismatchInfo | null;
  error: string | null;
};

function humanizeVariant(variant: string): string {
  return variant.split("_").reverse().join(" "); // "flag_7v7" → "7v7 flag"
}

function mismatchMessage(vm: VariantMismatchInfo): string {
  return (
    `That looks like a ${vm.photoPlayers}-player play, but this playbook is ${humanizeVariant(vm.variant)} (${vm.expectedPlayers} players). ` +
    `Open a playbook that matches the play's format and import it there — or re-crop if the panel caught players from a neighboring play.`
  );
}

/** Rotating status lines + elapsed seconds, so a 20-60s model call
 *  reads as work-in-progress instead of a stuck spinner. */
function StageTicker({ stages, note }: { stages: string[]; note?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const stage = stages[Math.min(Math.floor(elapsed / 7), stages.length - 1)];
  return (
    <div className="text-center">
      <div className="text-sm font-medium text-foreground">{stage}</div>
      <div className="mt-1 text-xs tabular-nums text-muted">
        {elapsed}s{note ? ` · ${note}` : ""}
      </div>
    </div>
  );
}

const ROUTE_FAMILIES = ROUTE_TEMPLATES.map((t) => t.name);
const KIND_OPTIONS = [
  { value: "route", label: "Route" },
  { value: "carry", label: "Carry (run)" },
  { value: "block", label: "Block" },
  { value: "motion", label: "Motion only" },
  { value: "unspecified", label: "No assignment" },
] as const;

const CONF_BADGE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800 border-emerald-200",
  med: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-red-100 text-red-700 border-red-200",
};

async function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

/** Downscale to ≤2600px long edge as JPEG — matches the vision model's
 *  useful resolution and keeps request bodies small. Also normalizes
 *  every camera format the browser can decode into JPEG. */
async function fileToImage(file: File): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageEl(url);
    const maxDim = 2600;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg", dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Cut the selected panel (with the same 6% margin the server uses) out
 *  of the local image for the review side-by-side. */
async function cropPreviewDataUrl(image: LoadedImage, bbox: BBox): Promise<string> {
  const img = await loadImageEl(image.dataUrl);
  const mx = bbox.w * 0.06;
  const my = bbox.h * 0.06;
  const x = Math.max(0, bbox.x - mx);
  const y = Math.max(0, bbox.y - my);
  const w = Math.min(1 - x, bbox.w + 2 * mx);
  const h = Math.min(1 - y, bbox.h + 2 * my);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * img.naturalWidth));
  canvas.height = Math.max(1, Math.round(h * img.naturalHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) return image.dataUrl;
  ctx.drawImage(
    img,
    Math.round(x * img.naturalWidth),
    Math.round(y * img.naturalHeight),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}

function defaultActionForKind(kind: string, prior: AssignmentAction): AssignmentAction {
  if (kind === prior.kind) return prior;
  switch (kind) {
    case "route":
      return { kind: "route", family: "Go", depthYds: 15 };
    case "carry":
      return { kind: "carry", runType: "sweep" };
    case "block":
      return { kind: "block" };
    case "motion":
      return { kind: "motion" };
    default:
      return { kind: "unspecified" };
  }
}

export function PhotoImportClient(props: {
  playbookId: string;
  variant: SportVariant;
  capRemaining: number;
  capLimit: number;
  capExempt: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [capRemaining, setCapRemaining] = useState(props.capRemaining);

  // Review state
  const [spec, setSpec] = useState<PlaySpec | null>(null);
  const [extraction, setExtraction] = useState<PlayExtraction | null>(null);
  const [mapping, setMapping] = useState<PlayerMapping[]>([]);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [cropPreview, setCropPreview] = useState<string | null>(null);
  const [playName, setPlayName] = useState("");
  const [lastPanels, setLastPanels] = useState<Panel[] | null>(null);
  const [debugCopied, setDebugCopied] = useState(false);
  const [useSheetLabels, setUseSheetLabels] = useState(true);
  const [recentJobs, setRecentJobs] = useState<(JobSummary & { stale: boolean })[]>([]);
  const [resumeJob, setResumeJob] = useState<JobFull | null>(null);
  const [resumeStale, setResumeStale] = useState(false);
  const [staleMs, setStaleMs] = useState(150_000);

  // Staleness is judged when data arrives (not during render — the
  // react-hooks purity rule, and it only needs job-fetch granularity).
  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/photo-import/jobs?playbookId=${encodeURIComponent(props.playbookId)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { jobs?: JobSummary[]; staleMs?: number };
      const threshold = typeof json.staleMs === "number" ? json.staleMs : 150_000;
      const now = Date.now();
      setRecentJobs(
        (json.jobs ?? []).map((j) => ({
          ...j,
          stale: j.status === "running" && now - new Date(j.updatedAt).getTime() > threshold,
        })),
      );
      if (typeof json.staleMs === "number") setStaleMs(json.staleMs);
    } catch {
      // Recent-imports is a convenience — never block the flow on it.
    }
  }, [props.playbookId]);

  useEffect(() => {
    // Deferred so the effect body itself stays setState-free.
    const t = setTimeout(() => void refreshJobs(), 0);
    return () => clearTimeout(t);
  }, [refreshJobs]);

  const capText = props.capExempt
    ? null
    : `${capRemaining} of ${props.capLimit} photo imports left this month`;

  // Live draft render — the same pipeline the save path validates:
  // spec → renderer → photo alignment (players start where the photo
  // shows them, motion drawn) → sheet letters/colors.
  const preview = useMemo(() => {
    if (!spec) return null;
    try {
      const rendered = playSpecToCoachDiagram(spec);
      const aligned = applyPhotoAlignment(rendered.diagram, mapping, props.variant);
      const identified = applySheetIdentity(aligned, mapping, { labels: useSheetLabels });
      return {
        json: JSON.stringify({ ...identified, title: playName || spec.title }),
        renderWarnings: rendered.warnings,
      };
    } catch {
      return null;
    }
  }, [spec, mapping, playName, useSheetLabels, props.variant]);

  const postJson = useCallback(async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
    return json;
  }, []);

  /** Shared landing for extract + retry + resume responses. Throws on
   *  mismatch/incomplete so callers route the message to their own
   *  fallback phase. */
  const applyImportResult = useCallback(
    (json: ExtractResponse, cropDataUrl: string | null, fallbackName: string) => {
      setCapRemaining(json.capRemaining);
      if (json.variantMismatch) throw new Error(mismatchMessage(json.variantMismatch));
      if (!json.spec || !json.extraction || !json.mapping) {
        throw new Error("The reader returned an incomplete result — try again.");
      }
      setSpec(json.spec);
      setExtraction(json.extraction);
      setMapping(json.mapping);
      setWarnings(json.warnings ?? []);
      setPlayName(json.spec.title ?? fallbackName);
      setCropPreview(cropDataUrl);
      setPhase({ step: "review" });
    },
    [],
  );

  const extractPanelFlow = useCallback(
    async (img: LoadedImage, panel: Panel | null, panels: Panel[] | null) => {
      setError(null);
      setPhase({ step: "extracting", label: panel?.label ?? "your play", panels });
      try {
        const json = (await postJson("/api/photo-import/extract", {
          playbookId: props.playbookId,
          image: { base64: img.base64, mediaType: img.mediaType },
          ...(panel ? { bbox: panel.bbox, label: panel.label } : { label: "Imported play" }),
        })) as unknown as ExtractResponse;
        const cropDataUrl = await cropPreviewDataUrl(img, panel?.bbox ?? { x: 0, y: 0, w: 1, h: 1 });
        applyImportResult(json, cropDataUrl, panel?.label ?? "Imported play");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Extraction failed.");
        setPhase(panels ? { step: "panels", panels } : { step: "pick" });
        void refreshJobs();
      }
    },
    [postJson, props.playbookId, applyImportResult, refreshJobs],
  );

  /** Retry a stalled/errored job from its stored crop (no re-upload). */
  const onRetry = useCallback(
    async (jobId: string) => {
      setError(null);
      setResumeStale(false);
      setResumeJob((j) => (j ? { ...j, status: "running", error: null, updatedAt: new Date().toISOString() } : j));
      try {
        const json = (await postJson(`/api/photo-import/jobs/${jobId}/retry`, {})) as unknown as ExtractResponse;
        const cropDataUrl = resumeJob?.cropBase64
          ? `data:${resumeJob.mediaType ?? "image/jpeg"};base64,${resumeJob.cropBase64}`
          : null;
        applyImportResult(json, cropDataUrl, resumeJob?.label ?? "Imported play");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Retry failed.");
        setPhase({ step: "pick" });
        void refreshJobs();
      }
    },
    [postJson, resumeJob, applyImportResult, refreshJobs],
  );

  // Resume polling: while on the resuming screen, refresh the job every
  // 5s; a finished job hydrates straight into review.
  useEffect(() => {
    if (phase.step !== "resuming") return;
    const jobId = phase.jobId;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/photo-import/jobs/${jobId}`);
        const json = (await res.json().catch(() => ({}))) as { job?: JobFull; error?: string; staleMs?: number };
        if (cancelled) return;
        if (!res.ok || !json.job) {
          setError(json.error ?? "Couldn't load that import — it may have expired.");
          setPhase({ step: "pick" });
          void refreshJobs();
          return;
        }
        const threshold = typeof json.staleMs === "number" ? json.staleMs : staleMs;
        if (typeof json.staleMs === "number") setStaleMs(json.staleMs);
        setResumeJob(json.job);
        setResumeStale(
          json.job.status === "running" && Date.now() - new Date(json.job.updatedAt).getTime() > threshold,
        );
        if (json.job.status === "done") {
          try {
            applyImportResult(
              {
                capRemaining,
                variantMismatch: json.job.variantMismatch ?? undefined,
                spec: json.job.spec ?? undefined,
                extraction: json.job.extraction ?? undefined,
                mapping: json.job.mapping ?? undefined,
                warnings: json.job.warnings ?? undefined,
              },
              json.job.cropBase64 ? `data:${json.job.mediaType ?? "image/jpeg"};base64,${json.job.cropBase64}` : null,
              json.job.label,
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Import failed.");
            setPhase({ step: "pick" });
            void refreshJobs();
          }
        }
      } catch {
        // transient — keep polling
      }
    };
    void tick();
    const timer = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // capRemaining/staleMs are read-through only; re-subscribing on their change is harmless.
  }, [phase, applyImportResult, refreshJobs, capRemaining, staleMs]);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setPhase({ step: "detecting" });
      try {
        const img = await fileToImage(file);
        setImage(img);
        const json = (await postJson("/api/photo-import/panels", {
          image: { base64: img.base64, mediaType: img.mediaType },
        })) as { panels?: Panel[] };
        const panels = json.panels ?? [];
        setLastPanels(panels);
        if (panels.length === 1) {
          // Single-play photo: skip the picker, show the dedicated
          // extracting screen (null panels → no grid to render).
          void extractPanelFlow(img, panels[0], null);
        } else {
          setPhase({ step: "panels", panels });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read the photo.");
        setPhase({ step: "pick" });
      }
    },
    [postJson, extractPanelFlow],
  );

  const updateAssignment = useCallback(
    (rosterId: string, update: (a: PlayerAssignment) => PlayerAssignment) => {
      setSpec((prior) => {
        if (!prior) return prior;
        return {
          ...prior,
          assignments: prior.assignments.map((a) => (a.player === rosterId ? update(a) : a)),
        };
      });
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (!spec) return;
    setError(null);
    setPhase({ step: "saving" });
    try {
      const json = (await postJson("/api/photo-import/save", {
        playbookId: props.playbookId,
        spec: { ...spec, title: playName || spec.title },
        name: playName || spec.title || "Imported play",
        mapping,
        useSheetLabels,
      })) as { url?: string };
      router.push(json.url ?? `/playbooks/${props.playbookId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setPhase({ step: "review" });
    }
  }, [spec, playName, mapping, useSheetLabels, postJson, props.playbookId, router]);

  const sheetAssignment = useCallback(
    (sheetLabel: string) =>
      extraction?.assignments.find((a) => a.player.trim().toUpperCase() === sheetLabel.trim().toUpperCase()),
    [extraction],
  );

  // ── Render ─────────────────────────────────────────────────────────

  const errorBox = error ? (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
  ) : null;

  if (phase.step === "pick" || phase.step === "detecting") {
    const busy = phase.step === "detecting";
    return (
      <div className="space-y-3">
        {errorBox}
        <label
          className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface p-8 text-center hover:bg-surface-raised ${busy ? "pointer-events-none opacity-70" : ""}`}
        >
          {busy ? <Loader2 className="size-8 animate-spin text-muted" /> : <Camera className="size-8 text-muted" />}
          {busy ? (
            <StageTicker
              stages={[
                "Scanning the photo for play panels…",
                "Reading panel borders and labels…",
                "Cropping each play…",
              ]}
              note="usually 10–25 seconds"
            />
          ) : (
            <div className="text-sm font-medium text-foreground">Take a photo or choose one</div>
          )}
          <div className="max-w-sm text-xs text-muted">
            Works with printed play-sheet exports (Playmaker X and similar) and clear hand-drawn plays. Panels are
            held privately for up to 24 hours while an import is in flight, then deleted.
          </div>
          {capText && <div className="text-xs font-medium text-muted">{capText}</div>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {recentJobs.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent imports</div>
            <div className="space-y-1.5">
              {recentJobs.map((j) => {
                const isStale = j.stale;
                const statusText =
                  j.status === "done"
                    ? j.hasMismatch
                      ? "Wrong playbook format"
                      : "Ready to review"
                    : j.status === "error"
                      ? "Failed — can retry"
                      : isStale
                        ? "Stalled — can retry"
                        : "Working…";
                const tone =
                  j.status === "done" && !j.hasMismatch
                    ? "text-emerald-700"
                    : j.status === "running" && !isStale
                      ? "text-muted"
                      : "text-amber-700";
                return (
                  <button
                    key={j.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      setResumeJob(null);
                      setPhase({ step: "resuming", jobId: j.id });
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-raised"
                  >
                    <span className="font-medium text-foreground">{j.label}</span>
                    <span className={`shrink-0 text-xs font-medium ${tone}`}>{statusText}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase.step === "resuming") {
    const j = resumeJob;
    const isStale = resumeStale;
    const failed = j?.status === "error";
    return (
      <div className="space-y-3">
        {errorBox}
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface p-8">
          {failed ? null : <Loader2 className="size-8 animate-spin text-muted" />}
          {failed ? (
            <div className="max-w-md text-center text-sm font-medium text-foreground">
              This import failed{j?.error ? `: ${j.error}` : "."}
            </div>
          ) : isStale ? (
            <div className="max-w-md text-center text-sm font-medium text-foreground">
              This read looks stalled — it probably lost its connection when the page closed. Retry runs it again
              from the stored panel (no re-upload).
            </div>
          ) : (
            <StageTicker
              stages={[
                `Reading ${j?.label ?? "your play"}…`,
                "Tracing each color from circle to arrowhead…",
                "Matching shapes to the route catalog…",
                "Counting gridlines for depths…",
                "Building the draft play…",
              ]}
              note="usually 20–60 seconds — you can leave and come back"
            />
          )}
          <div className="flex items-center gap-2">
            {(failed || isStale) && (
              <button
                type="button"
                onClick={() => void onRetry(phase.jobId)}
                className="rounded-lg border border-brand-green bg-brand-green px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-green-hover"
              >
                Retry this read
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setResumeJob(null);
                setPhase({ step: "pick" });
                void refreshJobs();
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-raised"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase.step === "panels" || (phase.step === "extracting" && phase.panels)) {
    const panels = phase.step === "panels" ? phase.panels : phase.panels!;
    const extracting = phase.step === "extracting";
    return (
      <div className="space-y-3">
        {errorBox}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            Found <span className="font-semibold text-foreground">{panels.length}</span> plays on this sheet — pick one
            to import{extracting ? "" : " (one at a time for now)"}.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised"
            onClick={() => {
              setPhase({ step: "pick" });
              setImage(null);
            }}
          >
            <RefreshCw className="size-3.5" /> Different photo
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {panels.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={extracting}
              onClick={() => image && void extractPanelFlow(image, p, panels)}
              className={`group overflow-hidden rounded-lg border border-border bg-surface text-left hover:border-brand-green ${extracting ? "opacity-60" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/jpeg;base64,${p.thumbBase64}`} alt={p.label} className="w-full" />
              <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-foreground">
                <span>{p.label}</span>
                {extracting && phase.step === "extracting" && phase.label === p.label ? (
                  <Loader2 className="size-3.5 animate-spin text-muted" />
                ) : (
                  <span className="text-muted opacity-0 transition group-hover:opacity-100">Import →</span>
                )}
              </div>
            </button>
          ))}
        </div>
        {extracting && (
          <p className="text-xs text-muted">
            You can leave this page — the read keeps going and will be under “Recent imports” when you return.
          </p>
        )}
        {capText && <p className="text-xs text-muted">{capText} — each imported play uses one.</p>}
      </div>
    );
  }

  if (phase.step === "extracting") {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface p-8">
        <Loader2 className="size-8 animate-spin text-muted" />
        <StageTicker
          stages={[
            `Reading ${phase.label}…`,
            "Tracing each color from circle to arrowhead…",
            "Matching shapes to the route catalog…",
            "Counting gridlines for depths…",
            "Building the draft play…",
          ]}
          note="usually 20–60 seconds"
        />
        <div className="max-w-sm text-center text-xs text-muted">
          You can leave this page — the read keeps going and will be waiting under “Recent imports” when you come
          back.
        </div>
      </div>
    );
  }

  if ((phase.step === "review" || phase.step === "saving") && spec) {
    const saving = phase.step === "saving";
    const lowConfidence = (conf?: string) => conf === "med" || conf === "low";
    return (
      <div className="space-y-4">
        {errorBox}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">From your photo</div>
            {cropPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cropPreview} alt="Photographed play" className="w-full rounded-lg border border-border" />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Draft play (edits apply live)</div>
            {preview ? (
              <PlayDiagramEmbed json={preview.json} />
            ) : (
              <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">Preview unavailable.</div>
            )}
          </div>
        </div>

        {(warnings.length > 0 || (preview?.renderWarnings.length ?? 0) > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Check these</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-amber-900">
              {warnings.map((w, i) => (
                <li key={`iw-${i}`}>{w.message}</li>
              ))}
              {preview?.renderWarnings.map((w, i) => (
                <li key={`rw-${i}`}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Sheet</th>
                <th className="px-3 py-2">Diagram</th>
                <th className="px-3 py-2">Assignment</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Depth</th>
                <th className="px-3 py-2">Break</th>
                <th className="px-3 py-2">Read</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((m) => {
                const assignment = spec.assignments.find((a) => a.player === m.rosterId);
                if (!assignment) return null;
                const action = assignment.action;
                const fromSheet = sheetAssignment(m.sheetLabel);
                const conf = fromSheet?.confidence;
                return (
                  <tr key={m.rosterId} className={`border-b border-border last:border-0 ${lowConfidence(conf) ? "bg-amber-50/40" : ""}`}>
                    <td className="px-3 py-2 font-semibold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: (m.sheetColor && SHEET_COLOR_HEX[m.sheetColor]) || "#9CA3AF" }}
                        />
                        {m.sheetLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{m.rosterId}</td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-md border border-border bg-surface px-1.5 py-1 text-sm"
                        value={action.kind === "unspecified" ? "unspecified" : action.kind}
                        disabled={saving}
                        onChange={(e) =>
                          updateAssignment(m.rosterId, (a) => ({ ...a, action: defaultActionForKind(e.target.value, a.action) }))
                        }
                      >
                        {KIND_OPTIONS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {action.kind === "route" ? (
                        <select
                          className="rounded-md border border-border bg-surface px-1.5 py-1 text-sm"
                          value={action.family}
                          disabled={saving}
                          onChange={(e) =>
                            updateAssignment(m.rosterId, (a) =>
                              a.action.kind === "route" ? { ...a, action: { ...a.action, family: e.target.value } } : a,
                            )
                          }
                        >
                          {ROUTE_FAMILIES.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {action.kind === "route" ? (
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="w-16 rounded-md border border-border bg-surface px-1.5 py-1 text-sm"
                          value={action.depthYds ?? ""}
                          disabled={saving}
                          onChange={(e) =>
                            updateAssignment(m.rosterId, (a) => {
                              if (a.action.kind !== "route") return a;
                              const v = e.target.value === "" ? undefined : Number(e.target.value);
                              const next = { ...a.action };
                              if (v === undefined || !Number.isFinite(v)) delete next.depthYds;
                              else next.depthYds = v;
                              return { ...a, action: next };
                            })
                          }
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {action.kind === "route" ? (
                        <select
                          className="rounded-md border border-border bg-surface px-1.5 py-1 text-sm"
                          value={action.direction ?? ""}
                          disabled={saving}
                          onChange={(e) =>
                            updateAssignment(m.rosterId, (a) => {
                              if (a.action.kind !== "route") return a;
                              const next = { ...a.action };
                              if (e.target.value === "") delete next.direction;
                              else next.direction = e.target.value as "left" | "right";
                              return { ...a, action: next };
                            })
                          }
                        >
                          <option value="">natural</option>
                          <option value="left">left</option>
                          <option value="right">right</option>
                        </select>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${CONF_BADGE[conf ?? "low"] ?? CONF_BADGE.low}`}
                        title={fromSheet?.evidence}
                      >
                        {conf ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-start justify-between gap-3">
          {(extraction?.ambiguities?.length ?? 0) > 0 ? (
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
              <span className="font-semibold text-foreground">Reader notes: </span>
              {extraction!.ambiguities!.join(" · ")}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <button
            type="button"
            title="Copy the raw read (extraction, spec, mapping, warnings) for debugging"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-raised hover:text-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify({ extraction, spec, mapping, warnings }, null, 2),
                );
                setDebugCopied(true);
                setTimeout(() => setDebugCopied(false), 2000);
              } catch {
                setError("Couldn't copy — clipboard unavailable in this browser.");
              }
            }}
          >
            <ClipboardCopy className="size-3.5" />
            {debugCopied ? "Copied ✓" : "Copy debug"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            Play name
            <input
              className="w-56 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              value={playName}
              disabled={saving}
              maxLength={80}
              onChange={(e) => setPlayName(e.target.value)}
            />
          </label>
          <label
            className="flex items-center gap-2 text-sm text-foreground"
            title="On: players keep the photo's letters (Z, B, Y…). Off: the playbook's own slot letters."
          >
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={useSheetLabels}
              disabled={saving}
              onChange={(e) => setUseSheetLabels(e.target.checked)}
            />
            Use the sheet&apos;s lettering
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSpec(null);
                setExtraction(null);
                setPhase(lastPanels && lastPanels.length > 1 ? { step: "panels", panels: lastPanels } : { step: "pick" });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
            >
              {lastPanels && lastPanels.length > 1 ? "Back to sheet" : "Start over"}
            </button>
            <button
              type="button"
              disabled={saving || !playName.trim()}
              onClick={() => void onSave()}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-green bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:opacity-60"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save to playbook
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
