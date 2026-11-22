import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceSettings } from "../../../../../packages/renderer-core/src/contracts/workspace";
import {
  DATABASE_VIEWS_KEY,
  DATABASE_VIEWS_BUDGET_BYTES,
  MAX_DATABASE_SCOPES,
  databaseViewOperation,
  defaultDatabaseView,
  readDatabaseView,
  withDatabaseView,
  type DatabaseView,
} from "../../../../../packages/renderer-core/src/database/config";

const settings: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "system",
  compactSidebar: false,
  showPageIcons: true,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "normal",
  showLineNumbers: false,
  editorPlaceholder: "Write",
};

function view(overrides: Partial<DatabaseView> = {}): DatabaseView {
  return { ...defaultDatabaseView("folder"), updatedAt: 1, ...overrides };
}

test("a scope without a saved layout reads the default", () => {
  const read = readDatabaseView(settings[DATABASE_VIEWS_KEY], "folder");
  assert.deepEqual(read, { view: defaultDatabaseView("folder"), problem: null, readOnly: false });
  assert.equal(readDatabaseView(settings[DATABASE_VIEWS_KEY], null).view.subfolders, true);
});

test("a saved layout round trips and other settings are kept", () => {
  const saved = view({
    layout: "board",
    groupBy: "p:status",
    sorts: [{ column: "title", direction: "desc" }],
  });
  const next = withDatabaseView(settings, "folder", saved, () => true);
  assert.equal(next.theme, "system");
  assert.deepEqual(readDatabaseView(next[DATABASE_VIEWS_KEY], "folder").view, saved);
});

test("layouts for folders that no longer exist are dropped on write", () => {
  const first = withDatabaseView(settings, "gone", view(), () => true);
  const second = withDatabaseView(first, "folder", view(), (id) => id !== "gone");
  const stored = second[DATABASE_VIEWS_KEY] as { views: Record<string, unknown> };
  assert.deepEqual(Object.keys(stored.views), ["folder"]);
});

test("the least recently changed layouts are evicted past the limit", () => {
  let next = settings;
  for (let index = 0; index <= MAX_DATABASE_SCOPES; index += 1) {
    next = withDatabaseView(next, `folder${index}`, view({ updatedAt: index + 1 }), () => true);
  }
  const stored = next[DATABASE_VIEWS_KEY] as { views: Record<string, unknown> };
  assert.equal(Object.keys(stored.views).length, MAX_DATABASE_SCOPES);
  assert.equal("folder0" in stored.views, false);
});

test("older layouts are evicted to keep the stored document under the size cap", () => {
  const wide = Array.from({ length: 128 }, (_, index) => `p:${"x".repeat(180)}${index}`);
  let next = settings;
  for (let index = 0; index < 12; index += 1) {
    next = withDatabaseView(
      next,
      `folder${index}`,
      view({ order: wide, hidden: wide, updatedAt: index + 1 }),
      () => true,
    );
  }
  const stored = next[DATABASE_VIEWS_KEY] as { views: Record<string, unknown> };
  const size = new TextEncoder().encode(JSON.stringify(stored)).length;
  assert.ok(size <= DATABASE_VIEWS_BUDGET_BYTES);
  assert.equal("folder11" in stored.views, true);
  assert.equal("folder0" in stored.views, false);
});

test("an unreadable entry falls back with a notice and a newer document is read-only", () => {
  const broken = {
    ...settings,
    [DATABASE_VIEWS_KEY]: { version: 1, views: { folder: { layout: "grid" } } },
  };
  const read = readDatabaseView(broken[DATABASE_VIEWS_KEY], "folder");
  assert.equal(read.readOnly, false);
  assert.match(read.problem ?? "", /unreadable/);

  const newer = { ...settings, [DATABASE_VIEWS_KEY]: { version: 2, views: {} } };
  assert.equal(readDatabaseView(newer[DATABASE_VIEWS_KEY], "folder").readOnly, true);
  assert.equal(
    withDatabaseView(newer, "folder", view(), () => true),
    newer,
  );
  assert.throws(() => databaseViewOperation(newer, "folder", view()), /newer version/);
});

test("a layout is saved through one set_database_view operation", () => {
  const saved = view({ layout: "board" });
  assert.deepEqual(databaseViewOperation(settings, "folder", saved), {
    type: "set_database_view",
    folderId: "folder",
    view: saved,
  });
  assert.deepEqual(databaseViewOperation(settings, null, saved), {
    type: "set_database_view",
    folderId: null,
    view: saved,
  });
});

test("clearing a scope keeps the others", () => {
  const first = withDatabaseView(settings, "folder", view(), () => true);
  const second = withDatabaseView(first, null, view({ updatedAt: 2 }), () => true);
  const cleared = withDatabaseView(second, "folder", null, () => true);
  const stored = cleared[DATABASE_VIEWS_KEY] as { views: Record<string, unknown> };
  assert.deepEqual(Object.keys(stored.views), ["@workspace"]);
});

test("a layout for a folder that is gone is not kept", () => {
  const next = withDatabaseView(settings, "gone", view(), () => false);
  const stored = next[DATABASE_VIEWS_KEY] as { views: Record<string, unknown> };
  assert.deepEqual(stored.views, {});
});

test("a layout over the operation's size cap is refused", () => {
  const wide = Array.from({ length: 128 }, (_, index) => `p:${"表".repeat(190)}${index}`);
  assert.throws(
    () => databaseViewOperation(settings, "folder", view({ order: wide, hidden: wide })),
    /too large/,
  );
});

test("invalid layouts are rejected before they are written", () => {
  assert.throws(
    () =>
      databaseViewOperation(
        settings,
        "folder",
        view({
          sorts: Array.from({ length: 4 }, () => ({ column: "title", direction: "asc" as const })),
        }),
      ),
    /invalid/,
  );
});
