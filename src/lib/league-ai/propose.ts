// Leo write-proposal shape + a human-readable preview for each consequential
// tool. The runner captures a consequential tool call as a LeoProposal (instead
// of executing it); the UI shows `preview` on an approval chip; on approval the
// approve route runs the real tool. `describeProposal` is pure so it's trivially
// testable and never touches the DB — recipient counts etc. come from Leo's own
// read-tool calls in its chat text, not from here.

export type LeoProposal = {
  toolName: string;
  input: Record<string, unknown>;
  /** One-line summary shown to the operator on the approval chip. */
  preview: string;
};

export function describeProposal(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const s = (k: string) => String(input[k] ?? "").trim();
  switch (toolName) {
    case "send_announcement": {
      const subject = s("subject") || "(no subject)";
      const audience = s("audience") || "everyone";
      return `Send the email "${subject}" to ${audience}.`;
    }
    case "send_group_announcement": {
      const subject = s("subject") || "(no subject)";
      const audience = s("audience") || "everyone";
      return `Send "${subject}" to ${audience} across every league in the group.`;
    }
    case "rename_league":
      return `Rename the league to "${s("name")}".`;
    case "set_registration_link": {
      const slug = s("slug");
      return slug
        ? `Set the registration link to /register/${slug}.`
        : "Clear the custom registration link.";
    }
    default:
      return `Run ${toolName}.`;
  }
}
