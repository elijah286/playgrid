/**
 * Client-side guard for the owner "remove + ban" action, mirroring the refusals
 * enforced authoritatively in the `remove_and_ban_member` SQL RPC. Used for
 * immediate UX feedback before the round-trip; the database remains the source
 * of truth (you can't ban yourself or a playbook owner).
 */
export function banTargetError(input: {
  actorUserId: string;
  targetUserId: string;
  targetRole: string | null;
}): string | null {
  if (input.targetUserId === input.actorUserId) return "You can't remove yourself.";
  if (input.targetRole === "owner") return "You can't ban the playbook owner.";
  return null;
}
