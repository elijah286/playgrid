"use client";

import { useState, useTransition } from "react";

import {
  createStoreItemAction,
  deleteStoreItemAction,
  listStoreItemsAction,
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-foreground">Item</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Jersey"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="font-medium text-foreground">
            Sizes <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            value={form.sizes}
            onChange={(e) => setForm({ ...form, sizes: e.target.value })}
            placeholder="e.g. Youth S, Youth M, Youth L, Adult M"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="mt-1 block text-xs text-muted">
            Comma-separated. Families pick one when they buy.
          </span>
        </label>
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
        {msg ? (
          <p
            className={`mt-3 text-sm ${
              msg.kind === "error" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-foreground/5 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Required</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  No items yet. Add jerseys, equipment, or fees parents can buy at registration.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imageUrl}
                          alt=""
                          className="size-9 shrink-0 rounded border border-border object-cover"
                        />
                      ) : null}
                      <div>
                        <span className="font-medium text-foreground">{it.name}</span>
                        {it.description ? (
                          <span className="ml-2 text-xs text-muted">{it.description}</span>
                        ) : null}
                        {it.sizes.length > 0 ? (
                          <span className="mt-0.5 block text-xs text-muted">
                            Sizes: {it.sizes.join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{money(it.priceCents)}</td>
                  <td className="px-4 py-3 text-muted">{it.required ? "Required" : "Optional"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
