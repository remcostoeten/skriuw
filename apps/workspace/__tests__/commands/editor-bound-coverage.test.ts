import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_BOUND_SHORTCUT_IDS } from "../../src/features/editor/editor-bound-shortcut-ids";
import { SHORTCUT_DEFINITIONS } from "../../src/commands/definitions";
import { shortcutHelpCombos } from "../../src/commands/help-model";
import type { ShortcutPlatform } from "../../src/commands/definitions";

const PLATFORMS: readonly ShortcutPlatform[] = ["mac", "windows", "linux"];

function boundInEditorIds(): Set<string> {
  return new Set(
    SHORTCUT_DEFINITIONS.filter((definition) => definition.boundInEditor).map(
      (definition) => definition.id,
    ),
  );
}

test("every editor-bound definition is handled by an editor surface", () => {
  const handled = new Set<string>(EDITOR_BOUND_SHORTCUT_IDS);
  for (const id of boundInEditorIds()) {
    assert.ok(
      handled.has(id),
      `${id} is boundInEditor but no editor surface handles it, so the cheat sheet lists a dead key`,
    );
  }
});

test("no editor surface handles a shortcut the command registry already owns", () => {
  const editorBound = boundInEditorIds();
  for (const id of EDITOR_BOUND_SHORTCUT_IDS) {
    assert.ok(
      editorBound.has(id),
      `${id} is handled in an editor surface but its definition is not boundInEditor, so it is also bound globally`,
    );
  }
});

test("every editor-bound definition the cheat sheet lists binds on that platform", () => {
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (!definition.boundInEditor) {
      continue;
    }
    const listed = PLATFORMS.filter(
      (platform) => shortcutHelpCombos(definition, {}, platform).length > 0,
    );
    assert.ok(
      listed.length > 0,
      `${definition.id} is wired in an editor surface but never listed on any platform`,
    );
  }
});
