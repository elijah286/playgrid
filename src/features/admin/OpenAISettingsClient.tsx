"use client";

import { useState, useTransition } from "react";
import {
  clearOpenAIApiKeyAction,
  getOpenAIIntegrationStatusAction,
  saveOpenAIApiKeyAction,
  testOpenAIApiKeyAction,
} from "@/app/actions/admin-integrations";

type Initial = {
  configured: boolean;
  statusLabel: string;
  updatedAt: string | null;
};

export function OpenAISettingsClient({ initial }: { initial: Initial }) {
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [draftKey, setDraftKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refreshStatus() {
    startTransition(async () => {
      const res = await getOpenAIIntegrationStatusAction();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setConfigured(res.configured);
      setStatusLabel(res.statusLabel);
      setUpdatedAt(res.updatedAt);
    });
  }

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl px-4 py-3 text-sm ring-1 ${
          configured
            ? "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:ring-emerald-800"
            : "bg-pg-chalk text-pg-muted ring-pg-line/80 dark:bg-pg-turf-deep/40 dark:text-pg-muted dark:ring-pg-line/40"
        }`}
        role="status"
      >
        <p className="font-medium text-pg-ink dark:text-pg-chalk">{statusLabel}</p>
        {updatedAt && (
          <p className="mt-1 text-xs opacity-80">Last updated {new Date(updatedAt).toLocaleString()}</p>
        )}
      </div>

      {(msg || testOk) && (
        <div className="space-y-2">
          {msg && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800">
              {msg}
            </p>
          )}
          {testOk && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800">
              {testOk}
            </p>
          )}
        </div>
      )}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-pg-line/80 dark:bg-pg-surface dark:ring-pg-line/40">
        <h2 className="text-lg font-semibold text-pg-ink dark:text-pg-chalk">OpenAI API key</h2>
        <p className="mt-1 text-sm text-pg-muted">
          Stored on the server for site-wide LLM features. Keys are never shown back in full after saving.
        </p>

        <label className="mt-4 block text-sm font-medium text-pg-ink dark:text-pg-chalk">
          New key
          <input
            type="password"
            autoComplete="off"
            value={draftKey}
            onChange={(e) => {
              setDraftKey(e.target.value);
              setMsg(null);
              setTestOk(null);
            }}
            placeholder={configured ? "Leave blank to keep current key" : "sk-…"}
            className="mt-1 w-full max-w-xl rounded-lg border border-pg-line/80 bg-white px-3 py-2 font-mono text-sm text-pg-ink outline-none ring-pg-turf focus:ring-2 dark:border-pg-line/50 dark:bg-pg-turf-deep/40 dark:text-pg-chalk"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !draftKey.trim()}
            onClick={() => {
              setMsg(null);
              setTestOk(null);
              startTransition(async () => {
                const res = await testOpenAIApiKeyAction(draftKey);
                if (!res.ok) setMsg(res.error);
                else setTestOk(res.message);
              });
            }}
            className="rounded-lg bg-pg-turf px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Test key in field
          </button>

          <button
            type="button"
            disabled={pending || !configured}
            onClick={() => {
              setMsg(null);
              setTestOk(null);
              startTransition(async () => {
                const res = await testOpenAIApiKeyAction();
                if (!res.ok) setMsg(res.error);
                else setTestOk(res.message);
              });
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-pg-ink ring-1 ring-pg-line hover:bg-pg-chalk disabled:cursor-not-allowed disabled:opacity-40 dark:text-pg-chalk dark:ring-pg-line/60 dark:hover:bg-pg-turf-deep/40"
          >
            Test saved key
          </button>
        </div>
        <p className="mt-2 text-xs text-pg-muted">
          Test calls OpenAI&apos;s <span className="font-mono">/v1/models</span> endpoint (no chat tokens used).
        </p>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-pg-line/60 pt-6 dark:border-pg-line/30">
          <button
            type="button"
            disabled={pending || !draftKey.trim()}
            onClick={() => {
              setMsg(null);
              setTestOk(null);
              startTransition(async () => {
                const res = await saveOpenAIApiKeyAction(draftKey);
                if (!res.ok) {
                  setMsg(res.error);
                  return;
                }
                setDraftKey("");
                setMsg(null);
                setTestOk("Key saved.");
                refreshStatus();
              });
            }}
            className="rounded-lg bg-pg-turf px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save key
          </button>

          <button
            type="button"
            disabled={pending || !configured}
            onClick={() => {
              if (!globalThis.confirm("Remove the saved OpenAI API key from the site?")) return;
              setMsg(null);
              setTestOk(null);
              startTransition(async () => {
                const res = await clearOpenAIApiKeyAction();
                if (!res.ok) {
                  setMsg(res.error);
                  return;
                }
                setMsg(null);
                setTestOk("Saved key removed.");
                refreshStatus();
              });
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950/40"
          >
            Remove saved key
          </button>
        </div>
      </section>
    </div>
  );
}
