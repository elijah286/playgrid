"use client";

import { useState, useTransition } from "react";
import {
  clearResendConfigAction,
  getResendStatusAction,
  saveResendConfigAction,
  testResendKeyAction,
} from "@/app/actions/admin-resend";

type Initial = {
  configured: boolean;
  statusLabel: string;
  fromEmail: string | null;
  contactToEmail: string | null;
  updatedAt: string | null;
};

export function ResendSettingsClient({ initial }: { initial: Initial }) {
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [fromEmail, setFromEmail] = useState(initial.fromEmail ?? "");
  const [contactToEmail, setContactToEmail] = useState(initial.contactToEmail ?? "");
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [draftKey, setDraftKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await getResendStatusAction();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setConfigured(res.configured);
      setStatusLabel(res.statusLabel);
      setFromEmail(res.fromEmail ?? "");
      setContactToEmail(res.contactToEmail ?? "");
      setUpdatedAt(res.updatedAt);
    });
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl px-4 py-3 text-sm ring-1 ${
          configured
            ? "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:ring-emerald-800"
            : "bg-pg-chalk text-pg-muted ring-pg-line/80 dark:bg-pg-turf-deep/40 dark:text-pg-muted dark:ring-pg-line/40"
        }`}
        role="status"
      >
        <p className="font-medium text-pg-ink dark:text-pg-chalk">{statusLabel}</p>
        {fromEmail && (
          <p className="mt-1 text-xs opacity-80">
            From: <span className="font-mono">{fromEmail}</span>
          </p>
        )}
        {updatedAt && (
          <p className="mt-1 text-xs opacity-80">
            Last updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {(msg || okMsg) && (
        <div className="space-y-2">
          {msg && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800">
              {msg}
            </p>
          )}
          {okMsg && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800">
              {okMsg}
            </p>
          )}
        </div>
      )}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-pg-line/80 dark:bg-pg-surface dark:ring-pg-line/40">
        <h2 className="text-lg font-semibold text-pg-ink dark:text-pg-chalk">
          Resend (contact form email)
        </h2>
        <p className="mt-1 text-sm text-pg-muted">
          Powers the contact-form email. Stored on the server; keys are never shown back in full
          after saving.
        </p>

        <label className="mt-4 block text-sm font-medium text-pg-ink dark:text-pg-chalk">
          API key
          <input
            type="password"
            autoComplete="off"
            value={draftKey}
            onChange={(e) => {
              setDraftKey(e.target.value);
              setMsg(null);
              setOkMsg(null);
            }}
            placeholder={configured ? "Leave blank to keep current key" : "re_…"}
            className="mt-1 w-full max-w-xl rounded-lg border border-pg-line/80 bg-white px-3 py-2 font-mono text-sm text-pg-ink outline-none ring-pg-turf focus:ring-2 dark:border-pg-line/50 dark:bg-pg-turf-deep/40 dark:text-pg-chalk"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-pg-ink dark:text-pg-chalk">
          From email (optional)
          <input
            type="text"
            autoComplete="off"
            value={fromEmail}
            onChange={(e) => {
              setFromEmail(e.target.value);
              setMsg(null);
              setOkMsg(null);
            }}
            placeholder="PlayGrid <onboarding@resend.dev>"
            className="mt-1 w-full max-w-xl rounded-lg border border-pg-line/80 bg-white px-3 py-2 font-mono text-sm text-pg-ink outline-none ring-pg-turf focus:ring-2 dark:border-pg-line/50 dark:bg-pg-turf-deep/40 dark:text-pg-chalk"
          />
          <span className="mt-1 block text-xs text-pg-muted">
            Leave blank to use <span className="font-mono">onboarding@resend.dev</span> (only
            delivers to your Resend account email until you verify a domain).
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium text-pg-ink dark:text-pg-chalk">
          Contact-form recipient
          <input
            type="email"
            autoComplete="off"
            value={contactToEmail}
            onChange={(e) => {
              setContactToEmail(e.target.value);
              setMsg(null);
              setOkMsg(null);
            }}
            placeholder="you@yourdomain.com"
            className="mt-1 w-full max-w-xl rounded-lg border border-pg-line/80 bg-white px-3 py-2 font-mono text-sm text-pg-ink outline-none ring-pg-turf focus:ring-2 dark:border-pg-line/50 dark:bg-pg-turf-deep/40 dark:text-pg-chalk"
          />
          <span className="mt-1 block text-xs text-pg-muted">
            Where messages from the public contact form are delivered. Leave blank to fall back to
            the <span className="font-mono">CONTACT_TO_EMAIL</span> environment variable.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !draftKey.trim()}
            onClick={() => {
              setMsg(null);
              setOkMsg(null);
              startTransition(async () => {
                const res = await testResendKeyAction(draftKey);
                if (!res.ok) setMsg(res.error);
                else setOkMsg(res.message);
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
              setOkMsg(null);
              startTransition(async () => {
                const res = await testResendKeyAction();
                if (!res.ok) setMsg(res.error);
                else setOkMsg(res.message);
              });
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-pg-ink ring-1 ring-pg-line hover:bg-pg-chalk disabled:cursor-not-allowed disabled:opacity-40 dark:text-pg-chalk dark:ring-pg-line/60 dark:hover:bg-pg-turf-deep/40"
          >
            Test saved key
          </button>
        </div>
        <p className="mt-2 text-xs text-pg-muted">
          Test calls Resend&apos;s <span className="font-mono">/domains</span> endpoint (no email
          sent).
        </p>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-pg-line/60 pt-6 dark:border-pg-line/30">
          <button
            type="button"
            disabled={
              pending || (!draftKey.trim() && !fromEmail.trim() && !contactToEmail.trim())
            }
            onClick={() => {
              setMsg(null);
              setOkMsg(null);
              startTransition(async () => {
                const res = await saveResendConfigAction({
                  apiKey: draftKey,
                  fromEmail,
                  contactToEmail,
                });
                if (!res.ok) {
                  setMsg(res.error);
                  return;
                }
                setDraftKey("");
                setOkMsg("Saved.");
                refresh();
              });
            }}
            className="rounded-lg bg-pg-turf px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>

          <button
            type="button"
            disabled={pending || !configured}
            onClick={() => {
              if (!globalThis.confirm("Remove the saved Resend API key and from-address?")) return;
              setMsg(null);
              setOkMsg(null);
              startTransition(async () => {
                const res = await clearResendConfigAction();
                if (!res.ok) {
                  setMsg(res.error);
                  return;
                }
                setOkMsg("Saved settings removed.");
                refresh();
              });
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950/40"
          >
            Remove
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-pg-line/80 dark:bg-pg-surface dark:ring-pg-line/40">
        <h3 className="text-base font-semibold text-pg-ink dark:text-pg-chalk">Setup instructions</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-pg-muted">
          <li>
            Create a free account at{" "}
            <a
              href="https://resend.com"
              target="_blank"
              rel="noreferrer noopener"
              className="text-pg-turf underline"
            >
              resend.com
            </a>{" "}
            using the same email that should receive contact-form messages.
          </li>
          <li>
            In the Resend dashboard, open <span className="font-medium">API Keys</span> → <span className="font-medium">Create API Key</span>.
            Copy the key (starts with <span className="font-mono">re_</span>) and paste it into the <span className="font-medium">API key</span> field above.
          </li>
          <li>
            Leave <span className="font-medium">From email</span> blank to start. Resend&apos;s default{" "}
            <span className="font-mono">onboarding@resend.dev</span> will only deliver to the email
            tied to your Resend account — which is fine for feedback from the contact form.
          </li>
          <li>
            Click <span className="font-medium">Test key in field</span> to confirm it works, then
            click <span className="font-medium">Save</span>.
          </li>
          <li>
            (Optional later) Verify a custom domain in Resend → <span className="font-medium">Domains</span>, then set
            &quot;From email&quot; above to something like{" "}
            <span className="font-mono">PlayGrid &lt;feedback@yourdomain.com&gt;</span> to send from your own domain.
          </li>
        </ol>
        <p className="mt-3 text-xs text-pg-muted">
          The contact form reads this config from the database on every submission — no redeploy
          needed when you change it.
        </p>
      </section>
    </div>
  );
}
