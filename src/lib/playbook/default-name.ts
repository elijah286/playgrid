import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

/**
 * Suggested name for a freshly claimed or duplicated playbook.
 * Format: "{First}'s {Variant} Playbook" (e.g. "Eli's Flag Playbook").
 *
 * Falls back to "My {Variant} Playbook" when the user has no display name.
 */
export function defaultClaimedPlaybookName(
  displayName: string | null,
  sportVariant: SportVariant | string | null,
): string {
  const variantLabel =
    sportVariant && sportVariant in SPORT_VARIANT_LABELS
      ? SPORT_VARIANT_LABELS[sportVariant as SportVariant]
      : "";
  const first = (displayName ?? "").trim().split(/\s+/)[0]?.trim() ?? "";
  const owner = first.length > 0 ? `${first}'s` : "My";
  return [owner, variantLabel, "Playbook"].filter(Boolean).join(" ");
}
