import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DATABASE_VIEWS_KEY,
  defaultDatabaseView,
  withDatabaseView,
} from "@skriuw/renderer-core/database/config";
import { createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { DatabaseView } from "@/features/database/database-view";
import { databaseState } from "../../../../../packages/renderer-core/src/database/fixtures";

function render(folderId: string | null, state: RendererState = databaseState()): string {
  const store = createRendererStore(state);
  return renderToStaticMarkup(
    createElement(DatabaseView, { store, folderId, windowControls: null }),
  );
}

function rowHeaders(html: string): string[] {
  return [...html.matchAll(/role="rowheader"[^>]*>(?:<[^>]+>)*([^<]+)</g)].map(
    (match) => match[1]!,
  );
}

test("a folder opens as a grid with a header row and one row per note", () => {
  const html = render("projects");
  assert.match(html, /<h1[^>]*>Projects<\/h1>/);
  assert.match(html, /role="grid"/);
  assert.match(html, /aria-rowcount="4"/);
  assert.deepEqual(rowHeaders(html), ["Alpha", "Beta", "Gamma"]);
  assert.match(html, /role="columnheader"[^>]*>.*Status/);
  assert.match(html, /3 notes/);
});

test("the workspace scope includes notes in folders and leaves the journal out", () => {
  const html = render(null);
  assert.match(html, /<h1[^>]*>All notes<\/h1>/);
  assert.deepEqual(rowHeaders(html), ["Delta", "Alpha", "Beta", "Gamma", "Epsilon"]);
});

test("a saved board layout renders one section per status option", () => {
  const state = databaseState();
  const settings = withDatabaseView(
    state.settings,
    "projects",
    { ...defaultDatabaseView("projects"), layout: "board", groupBy: "p:status", updatedAt: 1 },
    () => true,
  );
  const html = render("projects", { ...state, settings });
  const headings = [...html.matchAll(/<h2 id="database-group-\d+"[^>]*>([^<]+)</g)].map(
    (match) => match[1],
  );
  assert.deepEqual(headings, ["No Status", "Todo", "Doing", "Done"]);
  assert.match(html, /data-note-id="alpha"/);
  assert.doesNotMatch(html, /role="grid"/);
});

test("board cards read each field's name with its value", () => {
  const state = databaseState();
  const settings = withDatabaseView(
    state.settings,
    "projects",
    { ...defaultDatabaseView("projects"), layout: "board", groupBy: "p:shipped", updatedAt: 1 },
    () => true,
  );
  const html = render("projects", { ...state, settings });
  const card = /<button[^>]*data-note-id="alpha"[^>]*>(.*?)<\/button>/.exec(html)?.[1] ?? "";
  const text = card.replace(/<[^>]+>/g, "");
  assert.match(text, /Status: Doing/);
  assert.match(text, /Priority: 2/);
});

test("a layout saved by a newer version is reported instead of overwritten", () => {
  const state = databaseState();
  const settings = { ...state.settings, [DATABASE_VIEWS_KEY]: { version: 99, views: {} } };
  const html = render("projects", { ...state, settings });
  assert.match(html, /saved by a newer version/);
  assert.match(html, /role="grid"/);
});

test("trashed folders, the journal and notes explain why they do not open", () => {
  const state = databaseState();
  const trashed = {
    ...state,
    nodes: new Map([...state.nodes].filter(([id]) => id !== "archive")),
  };
  assert.match(render("archive", trashed), /in the trash/);
  assert.match(render("journal-root"), /organized by date/);
  assert.match(render("alpha"), /Only folders open as a database/);
  assert.match(render("nowhere"), /no longer exists/);
  assert.doesNotMatch(render("alpha"), /role="grid"/);
});
