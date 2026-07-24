import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../src/shared/lib/noop";
import {
  createCommandRegistry,
  registryShortcutActions,
  type AppCommand,
  type CommandUiState,
} from "../../src/commands/registry";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";
import type { RendererState } from "../../src/store/types";

function fakeState(overrides: Partial<RendererState> = {}): RendererState {
  return { activeNoteId: null, ...overrides } as RendererState;
}

function fakeUi(overrides: Partial<CommandUiState> = {}): CommandUiState {
  return {
    route: "notes",
    sidebarOpen: true,
    metadataOpen: true,
    settingsOpen: false,
    ...overrides,
  };
}

test("registration rejects duplicate command ids", () => {
  const command: AppCommand = { id: "one", label: "One", group: "Actions", run: noop };
  assert.throws(() => createCommandRegistry([command, { ...command }]), /duplicate command id/);
});

test("registration rejects two commands claiming the same shortcut", () => {
  const commands: AppCommand[] = [
    { id: "one", label: "One", group: "Actions", shortcut: "createNote", run: noop },
    { id: "two", label: "Two", group: "Actions", shortcut: "createNote", run: noop },
  ];
  assert.throws(() => createCommandRegistry(commands), /duplicate command shortcut/);
});

test("looks up commands by id and by shortcut", () => {
  const registry = createCommandRegistry([
    { id: "one", label: "One", group: "Actions", shortcut: "createNote", run: noop },
    { id: "two", label: "Two", group: "Actions", run: noop },
  ]);
  assert.equal(registry.get("one")?.label, "One");
  assert.equal(registry.get("missing"), undefined);
  assert.equal(registry.commandForShortcut("createNote")?.id, "one");
  assert.equal(registry.commandForShortcut("openSettings"), undefined);
});

test("enabled and visible default to true and honor predicates", () => {
  const registry = createCommandRegistry([
    { id: "always", label: "Always", group: "Actions", run: noop },
    {
      id: "notes-only",
      label: "Notes only",
      group: "Actions",
      enabled: (_state, ui) => ui.route === "notes",
      run: noop,
    },
    {
      id: "needs-note",
      label: "Needs note",
      group: "Actions",
      visible: (state) => state.activeNoteId !== null,
      run: noop,
    },
  ]);
  assert.equal(registry.isEnabled("always", fakeState(), fakeUi()), true);
  assert.equal(registry.isVisible("always", fakeState(), fakeUi()), true);
  assert.equal(registry.isEnabled("notes-only", fakeState(), fakeUi({ route: "trash" })), false);
  assert.equal(registry.isEnabled("notes-only", fakeState(), fakeUi()), true);
  assert.equal(registry.isVisible("needs-note", fakeState(), fakeUi()), false);
  assert.equal(
    registry.isVisible("needs-note", fakeState({ activeNoteId: "note" }), fakeUi()),
    true,
  );
  assert.equal(registry.isEnabled("missing", fakeState(), fakeUi()), false);
});

test("run executes only enabled commands and reports the outcome", () => {
  let ran = 0;
  const registry = createCommandRegistry([
    {
      id: "guarded",
      label: "Guarded",
      group: "Actions",
      enabled: (_state, ui) => ui.route === "notes",
      run: () => {
        ran += 1;
      },
    },
  ]);
  assert.equal(registry.run("guarded", fakeState(), fakeUi({ route: "trash" })), false);
  assert.equal(ran, 0);
  assert.equal(registry.run("guarded", fakeState(), fakeUi()), true);
  assert.equal(ran, 1);
  assert.equal(registry.run("missing", fakeState(), fakeUi()), false);
});

test("shortcut actions cover every definition and route through the enabled gate", () => {
  let ran = 0;
  const registry = createCommandRegistry([
    {
      id: "guarded",
      label: "Guarded",
      group: "Actions",
      shortcut: "createNote",
      enabled: (_state, ui) => ui.route === "notes",
      run: () => {
        ran += 1;
      },
    },
  ]);
  let ui = fakeUi({ route: "trash" });
  const actions = registryShortcutActions(registry, fakeState, () => ui);
  for (const definition of SHORTCUT_DEFINITIONS) {
    assert.equal(typeof actions[definition.id], "function");
  }
  actions.createNote();
  assert.equal(ran, 0);
  ui = fakeUi();
  actions.createNote();
  assert.equal(ran, 1);
  actions.openSettings();
  assert.equal(ran, 1);
});

test("palette projection keeps visible enabled commands and resolves shortcut keys", () => {
  const registry = createCommandRegistry([
    {
      id: "shown",
      label: "Shown",
      group: "Navigation",
      keywords: ["visible"],
      hint: "hint",
      shortcut: "createNote",
      run: noop,
    },
    { id: "hidden", label: "Hidden", group: "Actions", visible: () => false, run: noop },
    { id: "disabled", label: "Disabled", group: "Actions", enabled: () => false, run: noop },
    { id: "bare", label: "Bare", group: "Actions", run: noop },
  ]);
  const items = registry.paletteItems(fakeState(), fakeUi(), (actionId) =>
    actionId === "createNote" ? "mod+n" : "",
  );
  assert.deepEqual(
    items.map((item) => item.id),
    ["shown", "bare"],
  );
  assert.partialDeepStrictEqual(items[0], {
    label: "Shown",
    group: "Navigation",
    hint: "hint",
    shortcut: "mod+n",
  });
  assert.deepEqual(items[0]?.keywords, ["visible"]);
  assert.equal(items[1]?.shortcut, undefined);
});
