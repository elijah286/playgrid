"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff, ImageIcon, ShoppingBag } from "lucide-react";

import {
  addSampleStoreItemsAction,
  createStoreItemAction,
  deleteStoreItemAction,
  listStoreItemsAction,
  setStoreItemActiveAction,
  updateStoreItemAction,
  uploadStoreImageAction,
  type StoreItemRow,
} from "@/app/actions/league-store";

type Msg = { kind: "error" | "success"; text: string } | null;

const EMPTY = {
  name: "",
  price: "",
  description: "",
  required: false,
  active: true,
  sizes: "",
  imageUrl: null as string | null,
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function StoreItemsManager({
  leagueId,
  initialItems,
}: {
  leagueId: string;
  initialItems: StoreItemRow[];
}) {
  const [items, setItems] = useState(initialItems);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleUpload(file: File | null) {
    if (!file) return;
    setMsg(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const r = await uploadStoreImageAction(fd);
    setUploading(false);
    if (!r.ok) setMsg({ kind: "error", text: r.error });
    else setForm((prev) => ({ ...prev, imageUrl: r.url }));
  }

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(it: StoreItemRow) {
    setEditingId(it.id);
    setForm({
      name: it.name,
      price: (it.priceCents / 100).toFixed(2),
      description: it.description ?? "",
      required: it.required,
      active: it.active,
      sizes: it.sizes.join(", "),
      imageUrl: it.imageUrl,
    });
    setMsg(null);
  }

  function refresh() {
    startTransition(async () => {
      const r = await listStoreItemsAction(leagueId);
      if (r.ok) setItems(r.items);
    });
  }

  function submit() {
    if (!form.name.trim()) return;
    setMsg(null);
    const input = {
      name: form.name,
      description: form.description || null,
      priceCents: Math.round((Number.parseFloat(form.price || "0") || 0) * 100),
      required: form.required,
      active: form.active,
      sizes: form.sizes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      imageUrl: form.imageUrl,
    };
    startTransition(async () => {
      const r = editingId
        ? await updateStoreItemAction(leagueId, editingId, input)
        : await createStoreItemAction(leagueId, input);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      reset();
      setMsg({ kind: "success", text: "Saved." });
      refresh();
    });
  }

  function toggleActive(it: StoreItemRow) {
    setMsg(null);
    startTransition(async () => {
      const r = await setStoreItemActiveAction(leagueId, it.id, !it.active);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, active: !it.active } : x)));
    });
  }

  function addSamples() {
    setMsg(null);
    startTransition(async () => {
      const r = await addSampleStoreItemsAction(leagueId);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({
        kind: "success",
        text:
          r.added > 0
            ? `Added ${r.added} sample item${r.added === 1 ? "" : "s"} — edit or remove them freely.`
            : "The sample items are already here.",
      });
      refresh();
    });
  }

  function remove(it: StoreItemRow) {
    if (!globalThis.confirm(`Remove "${it.name}"?`)) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteStoreItemAction(leagueId, it.id);
      if (!r.ok) setMsg({ kind: "error", text: r.error });
      else {
        setItems((prev) => prev.filter((x) => x.id !== it.id));
        if (editingId === it.id) reset();
        setMsg({ kind: "success", text: "Item removed." });
      }
    });
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[24rem_minmax(0,1fr)] xl:items-start">
      {/* left: add/edit form */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-border p-4">
          <div className="text-sm font-semibold text-foreground">
            {editingId ? "Edit item" : "Add an item"}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-foreground">Item</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Jersey"
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Price</span>
              <div className="mt-1 flex items-center rounded-lg border border-border bg-surface px-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <span className="text-sm text-muted">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-transparent py-2 pl-1 text-sm text-foreground focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional"
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">
                Sizes <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                value={form.sizes}
                onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                placeholder="e.g. Youth S, Youth M, Adult M"
                className={inputCls}
              />
              <span className="mt-1 block text-xs text-muted">
                Comma-separated. Families pick one when they buy.
              </span>
            </label>
          </div>
          <div className="mt-3">
            <span className="block text-sm font-medium text-foreground">
              Photo <span className="font-normal text-muted">(optional)</span>
            </span>
            <div className="mt-1 flex items-center gap-3">
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imageUrl}
                  alt=""
                  className="size-14 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted">
                  No photo
                </div>
              )}
              <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5">
                {uploading ? "Uploading…" : form.imageUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
                />
              </label>
              {form.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, imageUrl: null }))}
                  className="text-xs text-muted hover:text-foreground hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || !form.name.trim()}
              onClick={submit}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
              >
                Cancel
              </button>
            ) : null}
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
                className="size-4"
              />
              Required at registration
            </label>
          </div>
        </div>

        {msg ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              msg.kind === "error"
                ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
                : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>

      {/* right: the storefront as families will see it */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted">
            {items.length > 0 ? (
              <>
                {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                {items.filter((i) => i.active).length} visible to families
              </>
            ) : null}
          </div>
          <Link
            href={`/register/${leagueId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5"
          >
            Preview the family view ↗
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border px-6 py-12 text-center">
            <ShoppingBag className="mx-auto size-8 text-muted" />
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              No items yet. Families see these as add-ons during registration — jerseys,
              equipment, photo packages, or fees.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={addSamples}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              Add sample items
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {items.map((it) => (
              <div
                key={it.id}
                className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised ${it.active ? "" : "opacity-60"}`}
              >
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-surface-inset">
                    <ImageIcon className="size-6 text-muted/60" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{it.name}</div>
                      {it.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted">{it.description}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-foreground">
                      {money(it.priceCents)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {it.required ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Required
                      </span>
                    ) : null}
                    {!it.active ? (
                      <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-medium text-muted">
                        Hidden from families
                      </span>
                    ) : null}
                    {it.sizes.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-end gap-1.5 pt-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleActive(it)}
                      title={it.active ? "Hide from families" : "Show to families"}
                      className="rounded-lg border border-border p-1.5 text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                    >
                      {it.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startEdit(it)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(it)}
                      className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
