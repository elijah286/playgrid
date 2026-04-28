"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Card, Input, Select, useToast } from "@/components/ui";
import {
  deleteOpexServiceAction,
  listOpexEntriesAction,
  refreshAutoCostsAction,
  upsertOpexEntryAction,
  upsertOpexServiceAction,
  type OpexCategory,
  type OpexEntry,
  type OpexService,
} from "@/app/actions/admin-opex";

const CATEGORIES: OpexCategory[] = [
  "infra",
  "ai",
  "email",
  "domain",
  "payments",
  "dev_accounts",
  "other",
];

function todayMonth(): string {
  const d = new Date();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ymToFirstOfMonth(ym: string): string {
  return `${ym}-01`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function OpexAdminClient({
  initialServices,
  initialEntries,
  initialPeriodMonth,
  initialError,
}: {
  initialServices: OpexService[];
  initialEntries: OpexEntry[];
  initialPeriodMonth: string;
  initialError: string | null;
}) {
  const { toast } = useToast();
  const [services, setServices] = useState<OpexService[]>(initialServices);
  const [entries, setEntries] = useState<OpexEntry[]>(initialEntries);
  const [ym, setYm] = useState<string>(initialPeriodMonth);
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const entryByService = useMemo(() => {
    const map = new Map<string, OpexEntry>();
    for (const e of entries) map.set(e.serviceId, e);
    return map;
  }, [entries]);

  const total = useMemo(() => {
    let sum = 0;
    for (const s of services) {
      const e = entryByService.get(s.id);
      if (!e) continue;
      const v = e.amountCentsAuto ?? e.amountCentsManual ?? 0;
      sum += v;
    }
    return sum;
  }, [services, entryByService]);

  function loadMonth(nextYm: string) {
    setYm(nextYm);
    startTransition(async () => {
      const res = await listOpexEntriesAction(nextYm);
      if (!res.ok) {
        setError(res.error);
        toast(res.error, "error");
        return;
      }
      setError(null);
      setEntries(res.entries);
    });
  }

  function saveManual(serviceId: string, value: string, currentNotes: string | null) {
    const cents = parseDollarsToCents(value);
    if (value.trim() !== "" && cents === null) {
      toast("Amount must be a non-negative number.", "error");
      return;
    }
    startTransition(async () => {
      const res = await upsertOpexEntryAction({
        serviceId,
        periodMonth: ym,
        amountCentsManual: cents,
        notes: currentNotes,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const refresh = await listOpexEntriesAction(ym);
      if (refresh.ok) setEntries(refresh.entries);
    });
  }

  function saveNotes(serviceId: string, notes: string, currentManual: number | null) {
    startTransition(async () => {
      const res = await upsertOpexEntryAction({
        serviceId,
        periodMonth: ym,
        amountCentsManual: currentManual,
        notes: notes.trim() === "" ? null : notes,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const refresh = await listOpexEntriesAction(ym);
      if (refresh.ok) setEntries(refresh.entries);
    });
  }

  function refreshAuto() {
    startTransition(async () => {
      const res = await refreshAutoCostsAction(ym);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const failures = res.results.filter((r) => !r.ok);
      if (failures.length > 0) {
        toast(failures.map((f) => `${f.slug}: ${f.error}`).join(" · "), "error");
      } else {
        toast("Auto costs refreshed.", "success");
      }
      const refresh = await listOpexEntriesAction(ym);
      if (refresh.ok) setEntries(refresh.entries);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => loadMonth(shiftMonth(ym, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[10rem] text-center text-sm font-semibold text-foreground">
              {formatMonthLabel(ym)}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => loadMonth(shiftMonth(ym, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Input
              type="month"
              value={ym}
              onChange={(e) => loadMonth(e.target.value)}
              className="w-[10rem]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pending} onClick={refreshAuto}>
              <RefreshCw className="mr-1.5 size-4" />
              Refresh auto costs
            </Button>
            <Button size="sm" variant="primary" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="mr-1.5 size-4" />
              Add service
            </Button>
          </div>
        </div>

        {showAdd && (
          <AddServiceForm
            onCancel={() => setShowAdd(false)}
            onSaved={(svc) => {
              setServices((prev) => [...prev, svc].sort((a, b) => a.sortOrder - b.sortOrder));
              setShowAdd(false);
            }}
          />
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Service</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Auto $</th>
                <th className="py-2 pr-3 text-right">Manual $</th>
                <th className="py-2 pr-3">Notes</th>
                <th className="py-2 pr-3">Last auto</th>
                <th className="py-2 pr-1"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => {
                const entry = entryByService.get(svc.id);
                return (
                  <ServiceRow
                    key={svc.id}
                    svc={svc}
                    entry={entry}
                    pending={pending}
                    onSaveManual={(val) => saveManual(svc.id, val, entry?.notes ?? null)}
                    onSaveNotes={(val) => saveNotes(svc.id, val, entry?.amountCentsManual ?? null)}
                    onDelete={() => {
                      if (!globalThis.confirm(`Delete service "${svc.name}" and all its entries?`)) return;
                      startTransition(async () => {
                        const res = await deleteOpexServiceAction(svc.id);
                        if (!res.ok) {
                          toast(res.error, "error");
                          return;
                        }
                        setServices((prev) => prev.filter((s) => s.id !== svc.id));
                        setEntries((prev) => prev.filter((e) => e.serviceId !== svc.id));
                        toast("Service deleted.", "success");
                      });
                    }}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/10 font-semibold">
                <td className="py-3 pr-3" colSpan={3}>
                  Monthly total
                </td>
                <td className="py-3 pr-3 text-right" colSpan={4}>
                  ${dollars(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ServiceRow({
  svc,
  entry,
  pending,
  onSaveManual,
  onSaveNotes,
  onDelete,
}: {
  svc: OpexService;
  entry: OpexEntry | undefined;
  pending: boolean;
  onSaveManual: (val: string) => void;
  onSaveNotes: (val: string) => void;
  onDelete: () => void;
}) {
  const [manualDraft, setManualDraft] = useState(dollars(entry?.amountCentsManual));
  const [notesDraft, setNotesDraft] = useState(entry?.notes ?? "");

  useEffect(() => {
    setManualDraft(dollars(entry?.amountCentsManual));
    setNotesDraft(entry?.notes ?? "");
  }, [entry?.amountCentsManual, entry?.notes]);

  return (
    <tr className="border-b border-black/5">
      <td className="py-2 pr-3">
        {svc.website ? (
          <a
            href={svc.website}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            {svc.name}
            <ExternalLink className="ml-1 inline size-3 align-baseline text-muted" />
          </a>
        ) : (
          <div className="font-medium text-foreground">{svc.name}</div>
        )}
        {svc.website && (
          <a
            href={svc.website}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-muted hover:underline"
          >
            {svc.website.replace(/^https?:\/\//, "")}
          </a>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-muted">{svc.category}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {svc.autoFetch ? (entry?.amountCentsAuto != null ? `$${dollars(entry.amountCentsAuto)}` : "—") : ""}
      </td>
      <td className="py-2 pr-3 text-right">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={manualDraft}
          onChange={(e) => setManualDraft(e.target.value)}
          onBlur={() => {
            const before = dollars(entry?.amountCentsManual);
            if (manualDraft !== before) onSaveManual(manualDraft);
          }}
          disabled={pending}
          className="w-24 text-right"
          placeholder="0.00"
        />
      </td>
      <td className="py-2 pr-3">
        <Input
          type="text"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            if (notesDraft !== (entry?.notes ?? "")) onSaveNotes(notesDraft);
          }}
          disabled={pending}
          className="w-full"
          placeholder=""
        />
      </td>
      <td className="py-2 pr-3 text-xs text-muted">
        {entry?.autoFetchedAt ? new Date(entry.autoFetchedAt).toLocaleString() : ""}
      </td>
      <td className="py-2 pr-1 text-right">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onDelete}
          className="text-danger hover:bg-danger/10 hover:text-danger"
          aria-label={`Delete ${svc.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  );
}

function AddServiceForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (svc: OpexService) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<OpexCategory>("other");
  const [website, setWebsite] = useState("");

  return (
    <div className="mt-4 grid gap-2 rounded-lg bg-surface-inset p-3 sm:grid-cols-5">
      <Input placeholder="slug (e.g. fly_io)" value={slug} onChange={(e) => setSlug(e.target.value)} />
      <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <Select
        value={category}
        onChange={(v) => setCategory(v as OpexCategory)}
        options={CATEGORIES.map((c) => ({ value: c, label: c }))}
      />
      <Input placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          disabled={pending || !slug.trim() || !name.trim()}
          onClick={() => {
            startTransition(async () => {
              const res = await upsertOpexServiceAction({
                slug: slug.trim().toLowerCase(),
                name: name.trim(),
                category,
                website: website.trim() || null,
              });
              if (!res.ok) {
                toast(res.error, "error");
                return;
              }
              onSaved({
                id: crypto.randomUUID(), // optimistic; real id refetched on next page load
                slug: slug.trim().toLowerCase(),
                name: name.trim(),
                category,
                website: website.trim() || null,
                notes: null,
                autoFetch: false,
                sortOrder: 200,
              });
              toast("Service added.", "success");
            });
          }}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export { ymToFirstOfMonth, todayMonth };
