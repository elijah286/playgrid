import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getUserEntitlement, type Entitlement } from "./entitlement";

/**
 * Returns the entitlement of the playbook's owner (the user with role="owner"
 * in playbook_members). Free invitees of a Coach+ owner inherit the owner's
 * unlocked features. Returns a free-tier entitlement if the owner can't be
 * resolved — safer than leaking features.
 */
export async function getPlaybookOwnerEntitlement(
  playbookId: string,
): Promise<Entitlement | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", playbookId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!data?.user_id) return null;
  return getUserEntitlement(data.user_id);
}
