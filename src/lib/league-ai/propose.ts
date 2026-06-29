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
    case "set_registration_status": {
      const ids = Array.isArray(input.registrationIds) ? input.registrationIds : [];
      const status = s("status") || "updated";
      const n = ids.length;
      return `Set ${n} registration${n === 1 ? "" : "s"} to ${status}.`;
    }
    case "create_teams": {
      const names = Array.isArray(input.names) ? input.names.map((x) => String(x).trim()).filter(Boolean) : [];
      const n = names.length;
      return `Create ${n} team${n === 1 ? "" : "s"}: ${names.join(", ")}.`;
    }
    case "assign_team_coach": {
      const coach = s("coachName") || s("coachEmail");
      return coach ? `Set the team's head coach to ${coach}.` : "Clear the team's head coach.";
    }
    case "place_players_on_team": {
      const ids = Array.isArray(input.registrationIds) ? input.registrationIds : [];
      const n = ids.length;
      return `Roster ${n} player${n === 1 ? "" : "s"} onto the team.`;
    }
    case "unassign_player":
      return "Remove the player from their team (back to the approved pool).";
    default:
      return `Run ${toolName}.`;
  }
}
