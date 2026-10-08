import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { repositoryPath } from "../../../../../support/paths";

function source(path: string): string {
  return readFileSync(repositoryPath(path), "utf8");
}

test("the root layout runs the lock lifecycle around the whole shell", () => {
  const layout = source("apps/mobile/app/_layout.tsx");
  assert.match(layout, /import \{ LockGate \} from "@\/features\/lock\/lock-gate"/);
  assert.match(layout, /<LockGate>\s*<ShellFrame>/);
});

test("the lock settings are reachable from the account sheet and the tree", () => {
  const shellFrame = source("apps/mobile/src/shell/shell-frame.tsx");
  assert.match(shellFrame, /open=\{chrome\.sheet === "lock"\}[\s\S]*?<LockSettingsView \/>/);
  assert.match(source("apps/mobile/src/shell/account-panel.tsx"), /<LockEntryRow \/>/);
  assert.match(source("apps/mobile/src/shell/tree-view.tsx"), /onToggleLock=\{onToggleLockRow\}/);
});

test("the shell frame puts the unlock screen over the editor", () => {
  const shellFrame = source("apps/mobile/src/shell/shell-frame.tsx");
  assert.match(shellFrame, /<SealedNoteGate active=\{editorVisible\}>\s*<EditorHost/);
});
