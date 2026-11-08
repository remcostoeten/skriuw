import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingToggle, SettingsGroup, SettingsRow } from "@/shared/ui/settings-controls";
import { SettingsLedgerContext } from "@/shared/ui/settings-ledger";
import type { LedgerSearchMatch, SettingsLedger } from "@/shared/ui/settings-ledger";

function ledger(search: LedgerSearchMatch | null): SettingsLedger {
  return { sectionId: "appearance", sectionLabel: "General", registry: null, query: "", search };
}

function page(): ReactNode {
  return [
    createElement(
      SettingsGroup,
      { key: "sidebar", id: "sidebar", title: "Sidebar", hint: "Notes tree" },
      createElement(SettingToggle, {
        label: "Compact sidebar",
        detail: "Tighter rows.",
        checked: false,
        changed: false,
        onChange: () => {},
      }),
      createElement(SettingToggle, {
        label: "Show tree guides",
        detail: "Indent guides.",
        checked: true,
        changed: true,
        onChange: () => {},
      }),
    ),
    createElement(
      SettingsGroup,
      { key: "workspace", id: "workspace", title: "Workspace" },
      createElement(SettingsRow, { label: "Remember last note", detail: "On start." }),
    ),
  ];
}

function render(search: LedgerSearchMatch | null): string {
  return renderToStaticMarkup(
    createElement(SettingsLedgerContext.Provider, { value: ledger(search) }, page()),
  );
}

test("a page renders every group as a ledger section with its margin title", () => {
  const markup = render(null);
  assert.match(markup, /id="settings-appearance-sidebar"/);
  assert.match(markup, /aria-labelledby="settings-appearance-sidebar-title"/);
  assert.match(markup, /Notes tree/);
  assert.match(markup, /Remember last note/);
});

test("search results keep only the matched rows of matched groups", () => {
  const markup = render(new Map([["sidebar", new Set(["Show tree guides"])]]));
  assert.match(markup, /Show tree guides/);
  assert.doesNotMatch(markup, /Compact sidebar/);
  assert.doesNotMatch(markup, /Remember last note/);
  assert.match(markup, />General</);
});

test("a whole-group match keeps every row of that group", () => {
  const markup = render(new Map([["sidebar", null]]));
  assert.match(markup, /Compact sidebar/);
  assert.match(markup, /Show tree guides/);
  assert.doesNotMatch(markup, /Remember last note/);
});

test("rows that differ from their default carry the changed dot", () => {
  const markup = render(null);
  const changed = markup.match(/title="Changed from default"[^>]*class="[^"]*opacity-100/g) ?? [];
  assert.equal(changed.length, 1);
});
