"use client";

import { useEffect } from "react";
import {
  formatOffset,
  type PracticePlanDocument,
} from "@/domain/practice-plan/types";

/**
 * Print-optimized layout. Designed to fit 60-120 min practices on 1-2 pages
 * (US Letter). Triggers window.print() on mount when ?auto=1.
 */
export function PracticePlanPrintView({
  title,
  document,
  autoPrint,
}: {
  title: string;
  document: PracticePlanDocument;
  autoPrint: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    // Small delay so fonts/layout settle.
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="practice-plan-print mx-auto max-w-[7.5in] bg-white p-6 text-black">
      <style>{PRINT_CSS}</style>

      {/* Screen-only toolbar */}
      <div className="screen-only mb-4 flex items-center justify-between border-b border-neutral-300 pb-3">
        <div className="text-sm text-neutral-600">
          Use your browser&apos;s print dialog (⌘/Ctrl + P) and choose &ldquo;Save as PDF.&rdquo;
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          Print
        </button>
      </div>

      {/* Header */}
      <header className="mb-4 border-b border-neutral-400 pb-3">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        <div className="mt-1 flex items-center gap-4 text-sm text-neutral-700">
          <span>
            <strong>Total:</strong> {formatOffset(document.totalDurationMinutes)}
          </span>
          <span>
            <strong>Blocks:</strong> {document.blocks.length}
          </span>
          {document.ageTier && (
            <span>
              <strong>Age tier:</strong> {ageTierLabel(document.ageTier)}
            </span>
          )}
        </div>
        {document.notes && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">
            {document.notes}
          </p>
        )}
      </header>

      {/* Blocks */}
      <ol className="space-y-2">
        {document.blocks.map((block) => {
          const blockEnd = block.startOffsetMinutes + block.durationMinutes;
          return (
            <li
              key={block.id}
              className="block-row break-inside-avoid border border-neutral-300 px-3 py-2"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums text-neutral-700">
                  {formatOffset(block.startOffsetMinutes)}–{formatOffset(blockEnd)}
                </span>
                <h2 className="text-base font-bold leading-tight">
                  {block.title || "Untitled block"}
                </h2>
                <span className="ml-auto text-xs text-neutral-600">
                  {block.durationMinutes} min
                </span>
              </div>
              {block.notes && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">
                  {block.notes}
                </p>
              )}
              {block.lanes.length > 0 && (
                <div
                  className={`mt-2 grid gap-2 ${
                    block.lanes.length === 1
                      ? "grid-cols-1"
                      : block.lanes.length === 2
                        ? "grid-cols-2"
                        : "grid-cols-3"
                  }`}
                >
                  {block.lanes.map((lane) => (
                    <div
                      key={lane.id}
                      className="rounded border border-neutral-200 bg-neutral-50 p-2"
                    >
                      {block.lanes.length > 1 && lane.title && (
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                          {lane.title}
                        </div>
                      )}
                      {lane.notes ? (
                        <p className="whitespace-pre-wrap text-xs leading-snug text-neutral-800">
                          {lane.notes}
                        </p>
                      ) : (
                        <p className="text-xs italic text-neutral-400">No notes</p>
                      )}
                      {lane.diagram && (
                        <div className="mt-1 text-[10px] italic text-neutral-500">
                          [Drill diagram]
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {document.blocks.length === 0 && (
        <p className="text-sm italic text-neutral-500">
          No blocks in this practice plan.
        </p>
      )}
    </div>
  );
}

function ageTierLabel(t: NonNullable<PracticePlanDocument["ageTier"]>): string {
  switch (t) {
    case "tier1_5_8":
      return "Ages 5-8";
    case "tier2_9_11":
      return "Ages 9-11";
    case "tier3_12_14":
      return "Ages 12-14";
    case "tier4_hs":
      return "HS / Varsity";
    default:
      return t;
  }
}

const PRINT_CSS = `
  @page {
    size: letter;
    margin: 0.5in;
  }
  @media screen {
    .practice-plan-print {
      min-height: 100vh;
    }
  }
  @media print {
    body {
      background: white !important;
    }
    .screen-only {
      display: none !important;
    }
    .practice-plan-print {
      max-width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .block-row {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`;
