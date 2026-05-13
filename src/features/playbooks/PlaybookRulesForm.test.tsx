/**
 * Rendering tests for the Playbook rules form.
 *
 * These pin the rules form's new Coach Cal capability section so a
 * future refactor can't drop the toggles or break the data shape
 * silently. Tests use `renderToStaticMarkup` (no DOM-testing dep)
 * mirroring the pattern in MessageMarkdown.test.tsx.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaybookRulesForm } from "./PlaybookRulesForm";
import {
  defaultSettingsForVariant,
  type PlaybookSettings,
} from "@/domain/playbook/settings";

function settingsFor(
  variant: Parameters<typeof defaultSettingsForVariant>[0],
  overrides: Partial<PlaybookSettings> = {},
): PlaybookSettings {
  return { ...defaultSettingsForVariant(variant), ...overrides };
}

function render(props: { value: PlaybookSettings }): string {
  return renderToStaticMarkup(
    <PlaybookRulesForm value={props.value} onChange={() => {}} />,
  );
}

describe("PlaybookRulesForm — advanced Coach Cal capabilities", () => {
  it("renders the section header and all three capability rows", () => {
    const html = render({ value: settingsFor("tackle_11") });
    expect(html).toContain("Advanced Coach Cal concepts");
    expect(html).toContain("Designed QB runs");
    expect(html).toContain("Multi-handoff plays");
    expect(html).toContain("Run-pass options (RPOs)");
  });

  it("includes the concrete play-type sublabels so the coach knows what they're opting into", () => {
    const html = render({ value: settingsFor("tackle_11") });
    expect(html).toContain("QB Draw, QB Power, QB Counter, QB Sneak");
    expect(html).toContain("Reverses, jet reverses, double reverses");
    expect(html).toContain("QB reads a key defender");
  });

  it("checks the boxes for capabilities the playbook has enabled (tackle defaults)", () => {
    // Tackle defaults include all three capabilities; every input
    // should be `checked`.
    const html = render({ value: settingsFor("tackle_11") });
    const checkedCount = (html.match(/checked=""/g) ?? []).length;
    // 3 advanced-capability checkboxes + the existing rule toggles
    // (rushing / handoffs / blocking / center-eligible). We assert at
    // least 3 checked boxes are present rather than an exact total to
    // stay robust against the unrelated rule toggles' defaults.
    expect(checkedCount).toBeGreaterThanOrEqual(3);
  });

  it("leaves the boxes unchecked for variants that didn't opt in (flag_7v7 defaults)", () => {
    // flag_7v7 ships with an empty advancedCapabilities list. The
    // three new checkboxes should all be unchecked. We test by
    // overriding to an explicit [] (sanity) and asserting no
    // `checked` attribute on inputs whose preceding label contains
    // one of the new row strings — a brittle string scan is fine
    // because the strings are unique enough.
    const html = render({
      value: settingsFor("flag_7v7", { advancedCapabilities: [] }),
    });
    // Each capability row's sublabel sits immediately before the
    // checkbox. If a checked attribute follows the sublabel, the
    // checkbox is checked. Use a regex to confirm none are.
    expect(
      /Designed QB runs.*?checked=""\/>/.test(html),
      "Designed QB runs checkbox should NOT be checked for flag_7v7 default",
    ).toBe(false);
    expect(
      /Multi-handoff plays.*?checked=""\/>/.test(html),
      "Multi-handoff plays checkbox should NOT be checked for flag_7v7 default",
    ).toBe(false);
    expect(
      /Run-pass options.*?checked=""\/>/.test(html),
      "RPO checkbox should NOT be checked for flag_7v7 default",
    ).toBe(false);
  });

  it("renders partial capability sets correctly when the coach explicitly opts in to one capability", () => {
    // flag_5v5 defaults to NO advanced capabilities (most 5v5 leagues
    // require a handoff before any run), so we explicitly opt in to
    // designed_qb_run here to exercise the partial-set render path.
    const html = render({
      value: settingsFor("flag_5v5", { advancedCapabilities: ["designed_qb_run"] }),
    });
    expect(/Designed QB runs.*?checked=""\/>/.test(html)).toBe(true);
    expect(/Multi-handoff plays.*?checked=""\/>/.test(html)).toBe(false);
    expect(/Run-pass options.*?checked=""\/>/.test(html)).toBe(false);
  });
});
