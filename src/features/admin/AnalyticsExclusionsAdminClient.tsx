"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { setAnalyticsExcludedEmailsAction } from "@/app/actions/admin-analytics-exclusions";

export function AnalyticsExclusionsAdminClient({
  initialEmails,
}: {
  initialEmails: string[];
}) {
  const { toast } = useToast();
  const [savedEmails, setSavedEmails] = useState<string[]>(initialEmails);
  const [text, setText] = useState<string>(initialEmails.join("\n"));
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(
    () =>
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0),
    [text],
  );
  const invalid = parsed.filter((e) => !e.includes("@"));
  const dirty =
    parsed.length !== savedEmails.length ||
    parsed.some((e, i) => e !== savedEmails[i]);

  function save() {
    if (invalid.length > 0) {
      toast(`Not a valid email: ${invalid[0]}`, "error");
      return;
    }
    startTransition(async () => {
      const res = await setAnalyticsExcludedEmailsAction(parsed);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setSavedEmails(res.emails);
      setText(res.emails.join("\n"));
      toast(
        res.emails.length === 0
          ? "Exclusion list cleared."
          : `Excluding ${res.emails.length} email${res.emails.length === 1 ? "" : "s"} from analytics.`,
        "success",
      );
    });
  }

  return (
    <div className="rounded-2xl bg-surface-raised p-5 ring-1 ring-black/5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          Excluded emails
        </h2>
        <p className="text-sm text-muted">
          Activity from these accounts is hidden from the Traffic and
          Monetization Health dashboards. Use this for your own accounts,
          family accounts, and test accounts so internal usage doesn&apos;t
          skew the numbers. One email per line (commas and spaces also work).
          Site admins are already excluded automatically.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="me@example.com&#10;family@example.com&#10;test@example.com"
        className="mt-3 block w-full rounded-lg bg-surface-inset px-3 py-2 font-mono text-sm text-foreground ring-1 ring-inset ring-black/5 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {parsed.length === 0
            ? "No emails will be excluded."
            : `${parsed.length} email${parsed.length === 1 ? "" : "s"} parsed.`}
          {invalid.length > 0 && (
            <span className="ml-2 text-red-700 dark:text-red-300">
              {invalid.length} invalid entry not saved.
            </span>
          )}
        </p>
        <Button
          type="button"
          onClick={save}
          disabled={pending || !dirty || invalid.length > 0}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
