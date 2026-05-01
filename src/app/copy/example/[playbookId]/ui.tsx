"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LogoPicker, useToast } from "@/components/ui";
import { acceptExamplePlaybookAction } from "@/app/actions/example-claim";
import { track } from "@/lib/analytics/track";

const PALETTE = [
  "#F26522", "#EF4444", "#EAB308", "#22C55E",
  "#3B82F6", "#A855F7", "#EC4899", "#1C1C1E",
];

export function ClaimExampleForm({
  playbookId,
  suggestedName,
  sourceColor,
  sourceLogoUrl,
  userEmail,
  blockedByQuota,
  quotaNote,
}: {
  playbookId: string;
  suggestedName: string;
  sourceColor: string;
  sourceLogoUrl: string | null;
  userEmail: string | null;
  blockedByQuota: boolean;
  quotaNote?: ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(suggestedName);
  const [color, setColor] = useState(sourceColor);
  const [logoUrl, setLogoUrl] = useState<string>(sourceLogoUrl ?? "");

  function claim() {
    if (blockedByQuota) {
      toast(
        "You've already used your free playbook slot. Upgrade to Team Coach to claim this one alongside it.",
        "error",
      );
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Give your playbook a name.", "error");
      return;
    }
    track({
      event: "example_cta_click",
      target: "claim_example_primary",
      metadata: { surface: "example_claim_page", playbook_id: playbookId },
    });
    start(async () => {
      const res = await acceptExamplePlaybookAction(playbookId, {
        name: trimmed,
        color,
        logoUrl: logoUrl.length > 0 ? logoUrl : null,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      router.push(`/playbooks/${res.playbookId}`);
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Make it yours.
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Pick a name, color, and logo — you can change them anytime. The
          example stays untouched for the next coach.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">
          Playbook name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggestedName}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">
          Team color
        </label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => {
            const active = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  active ? "border-foreground scale-110" : "border-border"
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            );
          })}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded-full border-2 border-border"
            aria-label="Custom color"
          />
        </div>
      </div>

      <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={pending} />

      {quotaNote}

      <Button
        onClick={claim}
        loading={pending}
        disabled={blockedByQuota || !name.trim()}
        className="w-full"
      >
        Claim &amp; customize
      </Button>

      {userEmail && (
        <p className="text-[11px] text-muted">
          Signed in as <span className="font-medium">{userEmail}</span>
        </p>
      )}
    </div>
  );
}
