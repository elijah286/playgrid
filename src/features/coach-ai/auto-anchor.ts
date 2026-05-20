/**
 * When Cal calls `create_playbook` from a lobby session (no playbook
 * anchor), the tool's result includes a markdown link
 * `[Open <name>](/playbooks/<id>)` which the model reliably surfaces in
 * its reply. We parse that link to auto-anchor the live conversation to
 * the new playbook in place — rather than the coach clicking it and
 * landing on an empty thread under a fresh storage key.
 *
 * Returns the new playbook id when all prerequisites hold, null when
 * the caller should fall back to the existing manual-link flow.
 */
export function detectAutoAnchorTarget(
  playbookId: string | null | undefined,
  mode: string,
  toolCalls: readonly string[] | undefined,
  text: string,
): string | null {
  if (playbookId != null) return null;
  if (mode !== "normal") return null;
  if (!toolCalls?.includes("create_playbook")) return null;
  const m = text.match(/\/playbooks\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
