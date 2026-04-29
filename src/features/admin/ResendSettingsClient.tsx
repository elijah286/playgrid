"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
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
  const { toast } = useToast();
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [savedFromEmail, setSavedFromEmail] = useState(initial.fromEmail ?? "");
  const [savedContactToEmail, setSavedContactToEmail] = useState(
    initial.contactToEmail ?? "",
  );
  const [fromEmail, setFromEmail] = useState(initial.fromEmail ?? "");
  const [contactToEmail, setContactToEmail] = useState(initial.contactToEmail ?? "");
  const [draftKey, setDraftKey] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    draftKey.trim().length > 0 ||
    fromEmail.trim() !== savedFromEmail.trim() ||
    contactToEmail.trim() !== savedContactToEmail.trim();

  function refresh() {
    startTransition(async () => {
      const res = await getResendStatusAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setConfigured(res.configured);
      setStatusLabel(res.statusLabel);
      setSavedFromEmail(res.fromEmail ?? "");
      setSavedContactToEmail(res.contactToEmail ?? "");
      setFromEmail(res.fromEmail ?? "");
      setContactToEmail(res.contactToEmail ?? "");
    });
  }

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <h3 className="text-base font-semibold text-foreground">Resend</h3>
          <p className="mt-0.5 text-xs text-muted">
            Powers the contact form. {statusLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot configured={configured} />
          <ChevronDown
            className={
              "size-4 text-muted transition-transform " +
              (expanded ? "rotate-180" : "")
            }
          />
        </div>
      </button>

      {expanded && (
      <>
      <div className="mt-4 space-y-3">
        <Field
          label="API key"
          hint={configured ? "Leave blank to keep the current key." : undefined}
        >
          <Input
            type="password"
            autoComplete="off"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={configured ? "••••••••••••" : "re_…"}
          />
        </Field>

        <Field
          label="From address"
          hint="Leave blank to use onboarding@resend.dev (only delivers to your Resend account email)."
        >
          <Input
            type="text"
            autoComplete="off"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="XO Gridmaker <onboarding@resend.dev>"
          />
        </Field>

        <Field
          label="Contact-form recipient"
          hint="Where messages from the public contact form are delivered."
        >
          <Input
            type="email"
            autoComplete="off"
            value={contactToEmail}
            onChange={(e) => setContactToEmail(e.target.value)}
            placeholder="you@yourdomain.com"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            disabled={pending || !dirty}
            onClick={() => {
              startTransition(async () => {
                const res = await saveResendConfigAction({
                  apiKey: draftKey,
                  fromEmail,
                  contactToEmail,
                });
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                setDraftKey("");
                toast("Saved.", "success");
                refresh();
              });
            }}
          >
            Save changes
          </Button>
          <Button
            size="sm"
            disabled={pending || (!draftKey.trim() && !configured)}
            onClick={() => {
              startTransition(async () => {
                const res = await testResendKeyAction(draftKey);
                if (!res.ok) toast(res.error, "error");
                else toast(res.message, "success");
              });
            }}
          >
            Test key
          </Button>
        </div>
        {configured && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!globalThis.confirm("Remove all saved Resend settings?")) return;
              startTransition(async () => {
                const res = await clearResendConfigAction();
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                setDraftKey("");
                toast("Resend settings removed.", "success");
                refresh();
              });
            }}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            Remove
          </Button>
        )}
      </div>

      <details className="mt-4 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">
          Setup instructions
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Create a free account at{" "}
            <a
              href="https://resend.com"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline"
            >
              resend.com
            </a>
            .
          </li>
          <li>Open API Keys → Create API Key. Paste the <code>re_…</code> key above.</li>
          <li>Leave From address blank until you verify a domain.</li>
          <li>Test the key, then Save.</li>
          <li>
            Later: verify a domain to send from your own address (e.g.{" "}
            <code>feedback@yourdomain.com</code>).
          </li>
        </ol>
      </details>
      </>
      )}
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function StatusDot({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle2 className="size-3" /> Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-border">
      <CircleAlert className="size-3" /> Not set
    </span>
  );
}
