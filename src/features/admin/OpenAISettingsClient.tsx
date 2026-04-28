"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import {
  clearOpenAIApiKeyAction,
  getOpenAIIntegrationStatusAction,
  saveOpenAIApiKeyAction,
  testOpenAIApiKeyAction,
  clearOpenAIAdminKeyAction,
  getOpenAIAdminKeyStatusAction,
  saveOpenAIAdminKeyAction,
} from "@/app/actions/admin-integrations";

type Initial = {
  configured: boolean;
  statusLabel: string;
  updatedAt: string | null;
};

type AdminInitial = {
  configured: boolean;
  statusLabel: string;
};

export function OpenAISettingsClient({
  initial,
  adminInitial,
}: {
  initial: Initial;
  adminInitial: AdminInitial;
}) {
  const { toast } = useToast();
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [draftKey, setDraftKey] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [adminConfigured, setAdminConfigured] = useState(adminInitial.configured);
  const [adminStatusLabel, setAdminStatusLabel] = useState(adminInitial.statusLabel);
  const [adminDraftKey, setAdminDraftKey] = useState("");

  function refreshAdminStatus() {
    startTransition(async () => {
      const res = await getOpenAIAdminKeyStatusAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setAdminConfigured(res.configured);
      setAdminStatusLabel(res.statusLabel);
    });
  }

  function refreshStatus() {
    startTransition(async () => {
      const res = await getOpenAIIntegrationStatusAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setConfigured(res.configured);
      setStatusLabel(res.statusLabel);
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
          <h3 className="text-base font-semibold text-foreground">OpenAI</h3>
          <p className="mt-0.5 text-xs text-muted">
            Powers site-wide LLM features. {statusLabel}
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
      <div className="mt-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">API key</span>
          <Input
            type="password"
            autoComplete="off"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={configured ? "••••••••••••" : "sk-…"}
          />
          {configured && (
            <span className="mt-1 block text-xs text-muted">
              Leave blank to keep the current key.
            </span>
          )}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            disabled={pending || !draftKey.trim()}
            onClick={() => {
              startTransition(async () => {
                const res = await saveOpenAIApiKeyAction(draftKey);
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                setDraftKey("");
                toast("Key saved.", "success");
                refreshStatus();
              });
            }}
          >
            Save key
          </Button>
          <Button
            size="sm"
            disabled={pending || (!draftKey.trim() && !configured)}
            onClick={() => {
              startTransition(async () => {
                const res = await testOpenAIApiKeyAction(draftKey || undefined);
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
              if (!globalThis.confirm("Remove the saved OpenAI API key?")) return;
              startTransition(async () => {
                const res = await clearOpenAIApiKeyAction();
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                toast("Saved key removed.", "success");
                refreshStatus();
              });
            }}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            Remove
          </Button>
        )}
      </div>

      <div className="mt-6 border-t border-black/5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Admin API key (cost reports)</h4>
            <p className="mt-0.5 text-xs text-muted">
              Used by the Opex tab to fetch monthly cost. Separate from the API key above. Create one at{" "}
              <a
                href="https://platform.openai.com/settings/organization/admin-keys"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                platform.openai.com → Organization → Admin keys
              </a>
              . {adminStatusLabel}
            </p>
          </div>
          <StatusDot configured={adminConfigured} />
        </div>
        <div className="mt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Admin key</span>
            <Input
              type="password"
              autoComplete="off"
              value={adminDraftKey}
              onChange={(e) => setAdminDraftKey(e.target.value)}
              placeholder={adminConfigured ? "••••••••••••" : "sk-admin-…"}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            disabled={pending || !adminDraftKey.trim()}
            onClick={() => {
              startTransition(async () => {
                const res = await saveOpenAIAdminKeyAction(adminDraftKey);
                if (!res.ok) {
                  toast(res.error, "error");
                  return;
                }
                setAdminDraftKey("");
                toast("Admin key saved.", "success");
                refreshAdminStatus();
              });
            }}
          >
            Save admin key
          </Button>
          {adminConfigured && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!globalThis.confirm("Remove the saved OpenAI admin key?")) return;
                startTransition(async () => {
                  const res = await clearOpenAIAdminKeyAction();
                  if (!res.ok) {
                    toast(res.error, "error");
                    return;
                  }
                  toast("Admin key removed.", "success");
                  refreshAdminStatus();
                });
              }}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      </>
      )}
    </Card>
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
