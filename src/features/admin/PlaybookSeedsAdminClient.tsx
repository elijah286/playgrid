"use client";

import { useState, useTransition } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import {
  removeSeedFormationAction,
  type SavedFormation,
} from "@/app/actions/formations";
import { Button, Card, EmptyState, useToast } from "@/components/ui";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { PlayType, SportVariant } from "@/domain/play/types";
import { FormationThumbnail } from "@/app/(dashboard)/playbooks/[playbookId]/PlaybookFormationsTab";

const KIND_LABEL: Record<PlayType, string> = {
  offense: "Offense",
  defense: "Defense",
  special_teams: "Special teams",
};

export function PlaybookSeedsAdminClient({
  initial,
}: {
  initial: SavedFormation[];
}) {
  const { toast } = useToast();
  const [seeds, setSeeds] = useState(initial);
  const [, startTransition] = useTransition();

  function handleRemove(seed: SavedFormation) {
    if (!window.confirm(`Remove "${seed.displayName}" from the seed pool? Existing playbook copies are untouched.`)) {
      return;
    }
    startTransition(async () => {
      const res = await removeSeedFormationAction(seed.id);
      if (res.ok) {
        setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
        toast(`Removed "${seed.displayName}" from seeds.`, "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  if (seeds.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        heading="No playbook seeds yet"
        description="Add a formation as a seed from any playbook's Formations tab to start this list."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Seed formations are snapshot-cloned into every new playbook of a
        matching sport type. Removing a seed only stops it from being cloned
        into future playbooks — existing playbook copies are untouched.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {seeds.map((s) => {
          const variant = (s.sportProfile?.variant ?? null) as SportVariant | null;
          return (
            <Card key={s.id} className="relative flex flex-col p-4">
              <h3 className="truncate pr-2 font-semibold text-foreground">
                {s.displayName}
              </h3>
              <div className="mt-2">
                <FormationThumbnail formation={s} />
              </div>
              <p className="mt-2 truncate text-xs text-muted">
                {[
                  KIND_LABEL[s.kind ?? "offense"],
                  variant ? SPORT_VARIANT_LABELS[variant] : null,
                  `${s.players.length} players`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Trash2}
                  onClick={() => handleRemove(s)}
                >
                  Remove as seed
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
