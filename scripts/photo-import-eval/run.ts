#!/usr/bin/env -S npx tsx
/**
 * Photo-import extraction eval runner (Phase 0).
 *
 * Crops a photographed play sheet into per-play panels, has a vision
 * model read each panel into the coordinate-free extraction schema, and
 * scores the readings against human-verified goldens. This is the
 * go/no-go gate for the photo-import feature — no product code ships
 * until the numbers in README.md's ship bar are met.
 *
 * Usage (from repo root, ANTHROPIC_API_KEY in env):
 *
 *   # 1. Crop only — verify grid geometry, no API calls
 *   npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --dry
 *
 *   # 2. Extract + score a subset while iterating
 *   npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --plays 1,3,8
 *
 *   # 3. Full run, pick a model
 *   npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --model claude-opus-4-8
 *
 *   # 4. Re-score a previous run after editing goldens (no API calls)
 *   npx tsx scripts/photo-import-eval/run.ts --score-only scripts/photo-import-eval/runs/<dir>
 *
 * Flags: --image <path> --model <id> --plays 1,3,8 --goldens <path>
 *        --out <dir> --region top,bottom,left,right --margin 0.06
 *        --dry --score-only <runDir>
 */

import fs from "node:fs";
import path from "node:path";
import { cropPlaysFromSheet, type CroppedPlay } from "@/lib/coach-ai/image-crop";
import { gridLayout, parseRegionFlag, DEFAULT_REGION, DEFAULT_CELL_MARGIN, type ContentRegion } from "./grid";
import { buildSystemPrompt, buildUserText } from "./prompt";
import { buildExtractionTool, playExtractionSchema, TOOL_NAME, type PlayExtraction } from "./schema";
import { loadGoldens, type GoldenSheet } from "./goldens";
import { scorePlay, renderReport, type PlayScore } from "./score";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 240_000;
const MAX_TOKENS = 8_000;

/** $ per MTok. Update alongside model choices; unknown models report cost=null. */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

function usageCostUsd(model: string, usages: Usage[]): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  let usd = 0;
  for (const u of usages) {
    usd +=
      ((u.input_tokens ?? 0) * p.input +
        (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
        (u.cache_read_input_tokens ?? 0) * p.input * 0.1 +
        (u.output_tokens ?? 0) * p.output) /
      1_000_000;
  }
  return usd;
}

/** Per-model request tuning. Fable 5 has thinking always on (sending a
 *  `thinking` param of any kind risks a 400 — omit it); Haiku 4.5
 *  supports neither adaptive thinking nor `effort`. Everything current
 *  in between gets adaptive thinking at high effort. No sampling params
 *  anywhere — they 400 on Opus 4.8 / Fable 5 / Sonnet 5. */
function modelTuning(model: string): Record<string, unknown> {
  if (model.startsWith("claude-fable") || model.startsWith("claude-mythos")) {
    return { output_config: { effort: "high" } };
  }
  if (model.startsWith("claude-haiku")) return {};
  return { thinking: { type: "adaptive" }, output_config: { effort: "high" } };
}

type ContentBlock = Record<string, unknown> & { type: string };
type ApiMessage = { role: "user" | "assistant"; content: ContentBlock[] };

async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ApiMessage[];
}): Promise<{ content: ContentBlock[]; stop_reason: string; usage: Usage }> {
  const body = {
    model: opts.model,
    max_tokens: MAX_TOKENS,
    ...modelTuning(opts.model),
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: opts.messages,
    tools: [buildExtractionTool()],
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 5_000 : 20_000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        continue; // retryable
      }
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
      }
      return {
        content: (json.content ?? []) as ContentBlock[],
        stop_reason: String(json.stop_reason ?? "unknown"),
        usage: (json.usage ?? {}) as Usage,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error(`request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

type ExtractionOutcome = {
  label: string;
  extraction: PlayExtraction | null;
  failure: string | null;
  raw: unknown[];
  usages: Usage[];
};

async function extractOnePlay(opts: {
  apiKey: string;
  model: string;
  system: string;
  crop: CroppedPlay;
}): Promise<ExtractionOutcome> {
  const imageBlock: ContentBlock = {
    type: "image",
    source: { type: "base64", media_type: opts.crop.mediaType, data: opts.crop.base64 },
  };
  const baseUser: ApiMessage = {
    role: "user",
    content: [imageBlock, { type: "text", text: buildUserText(opts.crop.label) }],
  };

  const raw: unknown[] = [];
  const usages: Usage[] = [];
  let messages: ApiMessage[] = [baseUser];

  // Two attempts: the second feeds validation errors back so the model
  // can correct its own tool input.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await callClaude({ apiKey: opts.apiKey, model: opts.model, system: opts.system, messages });
    raw.push(res);
    usages.push(res.usage);

    if (res.stop_reason === "refusal") {
      return { label: opts.crop.label, extraction: null, failure: "model refused the request", raw, usages };
    }

    const toolUse = res.content.find((b) => b.type === "tool_use" && (b as { name?: string }).name === TOOL_NAME) as
      | (ContentBlock & { id: string; input: unknown })
      | undefined;

    if (toolUse) {
      const parsed = playExtractionSchema.safeParse(toolUse.input);
      if (parsed.success) {
        return { label: opts.crop.label, extraction: parsed.data, failure: null, raw, usages };
      }
      if (attempt === 2) {
        return { label: opts.crop.label, extraction: null, failure: `invalid tool input after retry: ${parsed.error.message.slice(0, 400)}`, raw, usages };
      }
      messages = [
        baseUser,
        { role: "assistant", content: res.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              is_error: true,
              content: `Validation failed:\n${parsed.error.message.slice(0, 1200)}\n\nCall ${TOOL_NAME} again with corrected input.`,
            },
          ],
        },
      ];
      continue;
    }

    if (attempt === 2) {
      return { label: opts.crop.label, extraction: null, failure: "model never called the extraction tool", raw, usages };
    }
    messages = [
      baseUser,
      { role: "assistant", content: res.content },
      { role: "user", content: [{ type: "text", text: `You must respond by calling the ${TOOL_NAME} tool exactly once. Call it now with your reading of the panel.` }] },
    ];
  }
  throw new Error("unreachable");
}

// ── CLI plumbing ──────────────────────────────────────────────────────

type Args = {
  image?: string;
  model: string;
  goldens: string;
  plays: number[] | null;
  out?: string;
  region?: ContentRegion;
  margin: number;
  dry: boolean;
  scoreOnly?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    model: "claude-opus-4-8",
    goldens: path.join(__dirname, "goldens", "bomb-squad-offense-p1.json"),
    plays: null,
    margin: DEFAULT_CELL_MARGIN,
    dry: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      return v;
    };
    switch (flag) {
      case "--image": args.image = next(); break;
      case "--model": args.model = next(); break;
      case "--goldens": args.goldens = next(); break;
      case "--plays": args.plays = next().split(",").map((p) => parseInt(p.trim(), 10)).filter((n) => Number.isFinite(n)); break;
      case "--out": args.out = next(); break;
      case "--region": args.region = parseRegionFlag(next()); break;
      case "--margin": args.margin = Number(next()); break;
      case "--dry": args.dry = true; break;
      case "--score-only": args.scoreOnly = next(); break;
      default: throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

function mediaTypeForFile(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  throw new Error(`unsupported image type "${ext}" — export the photo as JPG or PNG (HEIC is not supported)`);
}

function playIndexFromLabel(label: string): number {
  const m = label.match(/(\d+)/);
  if (!m) throw new Error(`cannot derive play index from label "${label}"`);
  return parseInt(m[1], 10);
}

function writeReport(outDir: string, model: string, goldens: GoldenSheet, extractions: Map<number, PlayExtraction | null>, costUsd: number | null, notes: string[]): void {
  const scores: PlayScore[] = [];
  for (const golden of goldens.plays) {
    if (!extractions.has(golden.index)) continue; // play not part of this run
    scores.push(scorePlay(golden, extractions.get(golden.index) ?? null));
  }
  const report = renderReport({ model, scores, costUsd, notes });
  fs.writeFileSync(path.join(outDir, "report.md"), report);
  console.log("\n" + report.split("\n## Per-play detail")[0]);
  console.log(`\nFull report: ${path.join(outDir, "report.md")}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const goldens = loadGoldens(args.goldens);

  // Re-score a saved run (goldens edited, scorer improved — no API).
  if (args.scoreOnly) {
    const dir = args.scoreOnly;
    const extractions = new Map<number, PlayExtraction | null>();
    const extractionsDir = path.join(dir, "extractions");
    for (const f of fs.readdirSync(extractionsDir)) {
      const m = f.match(/play-(\d+)\.json$/);
      if (!m) continue;
      const parsed = playExtractionSchema.safeParse(JSON.parse(fs.readFileSync(path.join(extractionsDir, f), "utf8")));
      extractions.set(parseInt(m[1], 10), parsed.success ? parsed.data : null);
    }
    const model = fs.existsSync(path.join(dir, "summary.json"))
      ? (JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")).model ?? "unknown")
      : "unknown";
    writeReport(dir, model, goldens, extractions, null, ["Re-scored from saved extractions (--score-only)."]);
    return;
  }

  if (!args.image) throw new Error("--image <path> is required (or use --score-only <runDir>)");
  const imagePath = path.resolve(args.image.replace(/^~/, process.env.HOME ?? "~"));
  if (!fs.existsSync(imagePath)) throw new Error(`image not found: ${imagePath}`);

  const outDir =
    args.out ?? path.join(__dirname, "runs", `${args.model}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  fs.mkdirSync(path.join(outDir, "crops"), { recursive: true });

  // Crop the sheet on the goldens' grid.
  const region = args.region ?? goldens.grid.region ?? DEFAULT_REGION;
  const layoutAll = gridLayout(goldens.grid.rows, goldens.grid.cols, region, args.margin);
  const selected = args.plays === null ? layoutAll : layoutAll.filter((e) => args.plays!.includes(playIndexFromLabel(e.label)));
  if (selected.length === 0) throw new Error("no plays selected — check --plays against the goldens grid");

  const base64 = fs.readFileSync(imagePath).toString("base64");
  const crops = await cropPlaysFromSheet(base64, mediaTypeForFile(imagePath), selected);
  for (const crop of crops) {
    fs.writeFileSync(path.join(outDir, "crops", `${crop.label.toLowerCase().replace(/\s+/g, "-")}.jpg`), Buffer.from(crop.base64, "base64"));
  }
  console.log(`Cropped ${crops.length} panels → ${path.join(outDir, "crops")}`);

  if (args.dry) {
    console.log("--dry: stopping before API calls. Eyeball the crops, adjust --region/--margin if panels are clipped.");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  fs.mkdirSync(path.join(outDir, "extractions"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "raw"), { recursive: true });

  const system = buildSystemPrompt();
  const extractions = new Map<number, PlayExtraction | null>();
  const allUsages: Usage[] = [];
  const failures: string[] = [];

  // Sequential on purpose: the first call writes the system-prompt cache
  // the rest read, and per-panel latency is dominated by thinking anyway.
  for (const crop of crops) {
    const index = playIndexFromLabel(crop.label);
    const started = Date.now();
    try {
      const outcome = await extractOnePlay({ apiKey, model: args.model, system, crop });
      allUsages.push(...outcome.usages);
      fs.writeFileSync(path.join(outDir, "raw", `play-${index}.json`), JSON.stringify(outcome.raw, null, 2));
      if (outcome.extraction) {
        fs.writeFileSync(path.join(outDir, "extractions", `play-${index}.json`), JSON.stringify(outcome.extraction, null, 2));
      } else {
        failures.push(`Play ${index}: ${outcome.failure}`);
      }
      extractions.set(index, outcome.extraction);
      const cost = usageCostUsd(args.model, outcome.usages);
      console.log(
        `${crop.label}: ${outcome.extraction ? "ok" : `FAILED (${outcome.failure})`} — ${((Date.now() - started) / 1000).toFixed(0)}s${cost !== null ? `, $${cost.toFixed(3)}` : ""}`,
      );
    } catch (err) {
      extractions.set(index, null);
      failures.push(`Play ${index}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`${crop.label}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const costUsd = usageCostUsd(args.model, allUsages);
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(
      {
        model: args.model,
        image: imagePath,
        goldens: args.goldens,
        plays: [...extractions.keys()].sort((a, b) => a - b),
        failures,
        costUsd,
        usages: allUsages,
      },
      null,
      2,
    ),
  );

  const notes = failures.length > 0 ? [`${failures.length} extraction failure(s): ${failures.join("; ")}`] : [];
  writeReport(outDir, args.model, goldens, extractions, costUsd, notes);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
