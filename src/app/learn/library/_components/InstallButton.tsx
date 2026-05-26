"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { listCopyTargetPlaybooksAction, type PlaybookRow } from "@/app/actions/playbooks";
import { VARIANT_LABEL, type LibraryVariant } from "@/lib/learn/variant";

/**
 * Generic "Install from library" button used by both offense play pages and
 * defense pages. Checks auth client-side — if not signed in, renders a link
 * to the login page; if signed in, opens the install dialog.
 *
 * `onInstall` is the server action to call with the chosen playbook id.
 * It must return `{ ok: true, playId: string }` or `{ ok: false, error: string }`.
 */
export function InstallButton({
  variant,
  loginHref,
  dialogTitle,
  installing,
  onInstall,
}: {
  variant: LibraryVariant;
  loginHref: string;
  /** Title for the install dialog, e.g. "Install play" or "Install defense". */
  dialogTitle: string;
  /** Name of the thing being installed, shown inside the dialog. */
  installing: string;
  onInstall: (
    playbookId: string,
  ) => Promise<{ ok: true; playId: string } | { ok: false; error: string }>;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setAuthed(!!data.session));
  }, []);

  if (authed === null) {
    return <div className="mt-3 h-9 w-full animate-pulse rounded-lg bg-primary/30" />;
  }

  if (!authed) {
    return (
      <Link
        href={loginHref}
        className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
      >
        Add to my playbook
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
      >
        Add to my playbook
      </button>
      {dialogOpen && (
        <InstallDialog
          variant={variant}
          title={dialogTitle}
          installing={installing}
          onInstall={onInstall}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

function InstallDialog({
  variant,
  title,
  installing,
  onInstall,
  onClose,
}: {
  variant: LibraryVariant;
  title: string;
  installing: string;
  onInstall: (playbookId: string) => Promise<{ ok: true; playId: string } | { ok: false; error: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sameVariantOnly, setSameVariantOnly] = useState(true);
  const [destinationId, setDestinationId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listCopyTargetPlaybooksAction().then((res) => {
      setLoading(false);
      if (!res.ok) return;
      setPlaybooks(res.playbooks);
      const firstMatch = res.playbooks.find((p) => p.sport_variant === variant);
      setDestinationId(firstMatch?.id ?? res.playbooks[0]?.id ?? "");
    });
  }, [variant]);

  const filtered = useMemo(
    () =>
      sameVariantOnly
        ? playbooks.filter((p) => p.sport_variant === variant)
        : playbooks,
    [playbooks, sameVariantOnly, variant],
  );

  function handleInstall() {
    if (!destinationId) return;
    setError(null);
    startTransition(async () => {
      const res = await onInstall(destinationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.push(`/plays/${res.playId}/edit`);
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleInstall}
            disabled={pending || !destinationId || loading}
          >
            {pending ? "Installing…" : "Install"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-muted">
          Installing{" "}
          <span className="font-medium text-foreground">{installing}</span>.
        </div>

        {loading ? (
          <div className="text-xs text-muted">Loading playbooks…</div>
        ) : (
          <fieldset className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted">
                Choose a playbook
              </legend>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={sameVariantOnly}
                  onChange={(e) => {
                    setSameVariantOnly(e.target.checked);
                    if (!e.target.checked && !destinationId) {
                      setDestinationId(playbooks[0]?.id ?? "");
                    }
                  }}
                />
                {VARIANT_LABEL[variant]} only
              </label>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted">
                  {playbooks.length === 0
                    ? "No playbooks found."
                    : `No ${VARIANT_LABEL[variant]} playbooks. Uncheck the filter to see all.`}
                </div>
              ) : (
                filtered.map((pb) => (
                  <label
                    key={pb.id}
                    className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-inset"
                  >
                    <input
                      type="radio"
                      name="install-dest"
                      className="mt-0.5"
                      checked={destinationId === pb.id}
                      onChange={() => setDestinationId(pb.id)}
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">{pb.name}</span>
                      <span className="text-xs text-muted">
                        {VARIANT_LABEL[pb.sport_variant as LibraryVariant] ?? pb.sport_variant}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </fieldset>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
