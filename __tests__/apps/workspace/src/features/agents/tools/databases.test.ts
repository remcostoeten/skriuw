import { describe, expect, test } from "vitest";
import { DATABASE_VIEWS_KEY, readDatabaseView } from "@skriuw/renderer-core/database/config";
import { createHarness } from "../harness";

const BOARD = {
  title: "Roadmap",
  columns: [
    { name: "Status", type: "select", options: ["Backlog", "Doing", "Review", "Done"] },
    { name: "Points", type: "number" },
  ],
  groupBy: "Status",
  rows: [
    { title: "Login page", cells: { Status: "Doing", Points: 3 } },
    { title: "Billing", markdown: "Stripe first.", cells: { Status: "Backlog" } },
    { title: "Unsorted" },
  ],
};

describe("agent database tools", () => {
  test("create_database makes a board folder whose rows carry every lane option", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_database", BOARD);
    expect(created).toMatchObject({ layout: "board", groupBy: "Status", path: "Roadmap" });
    expect(created.noteIds).toHaveLength(3);
    const state = harness.store.getState();
    const view = readDatabaseView(state.settings[DATABASE_VIEWS_KEY], created.folderId).view;
    expect(view.layout).toBe("board");
    expect(view.groupBy).toBe("p:status");
    for (const noteId of created.noteIds) {
      const status = state.propertiesByNoteId
        .get(noteId)
        ?.find((property) => property.name === "Status");
      expect(status?.options.map((option) => option.label)).toEqual([
        "Backlog",
        "Doing",
        "Review",
        "Done",
      ]);
    }
  });

  test("read_database reports columns, lanes and readable cells", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_database", BOARD);
    const read = await harness.ok("read_database", { folderId: created.folderId });
    expect(read.columns).toEqual([
      { name: "Status", type: "select", options: ["Backlog", "Doing", "Review", "Done"] },
      { name: "Points", type: "number", options: [] },
    ]);
    const lanes = Object.fromEntries(
      read.lanes.map((lane: { lane: string; noteIds: string[] }) => [
        lane.lane,
        lane.noteIds.length,
      ]),
    );
    expect(lanes).toMatchObject({ Backlog: 1, Doing: 1 });
    const login = read.rows.find((row: { title: string }) => row.title === "Login page");
    expect(login.cells).toEqual({ Status: "Doing", Points: 3 });
  });

  test("set_properties moves a card to another lane and removes a property with null", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_database", BOARD);
    const card = created.noteIds[0];
    const moved = await harness.ok("set_properties", {
      noteId: card,
      properties: { Status: "Review", Points: null },
    });
    expect(moved.properties).toEqual({ Status: "Review" });
  });

  test("set_properties creates typed properties on any note", async () => {
    const harness = createHarness([{ id: "note", kind: "note", title: "Note" }]);
    const result = await harness.ok("set_properties", {
      noteId: "note",
      properties: {
        Due: "2026-12-01",
        Done: false,
        Labels: ["a", "b"],
        Link: { type: "url", value: "https://example.com" },
      },
    });
    expect(result.properties).toEqual({
      Due: "2026-12-01",
      Done: false,
      Labels: ["a", "b"],
      Link: "https://example.com",
    });
    const types = harness.store
      .getState()
      .propertiesByNoteId.get("note")
      ?.map((property) => property.value.type);
    expect(types).toEqual(["date", "checkbox", "multi-select", "url"]);
  });

  test("add_database_rows writes against the existing columns and their options", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_database", BOARD);
    const added = await harness.ok("add_database_rows", {
      folderId: created.folderId,
      rows: [{ title: "Search", cells: { Status: "done", Points: 5 } }],
    });
    const state = harness.store.getState();
    const status = state.propertiesByNoteId
      .get(added.noteIds[0])
      ?.find((property) => property.name === "Status");
    const chosen = status?.options.find((option) => option.id === status.value.value);
    expect(chosen?.label).toBe("Done");
    expect(status?.options).toHaveLength(4);
  });

  test("a wrongly typed cell is refused with the column name", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_database", BOARD);
    const refused = await harness.call("add_database_rows", {
      folderId: created.folderId,
      rows: [{ title: "Bad", cells: { Points: "many" } }],
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe("Points takes a number.");
  });

  test("configure_database switches layout and sorts by column name", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_database", BOARD);
    await harness.ok("configure_database", {
      folderId: created.folderId,
      layout: "table",
      sorts: [{ column: "Points", direction: "desc" }],
      hiddenColumns: ["Updated"],
    });
    const read = await harness.ok("read_database", { folderId: created.folderId });
    expect(read).toMatchObject({
      layout: "table",
      sorts: [{ column: "Points", direction: "desc" }],
      hiddenColumns: ["Updated"],
      lanes: null,
    });
    const unknown = await harness.call("configure_database", {
      folderId: created.folderId,
      groupBy: "Owner",
    });
    expect(unknown.text).toContain('no column "Owner"');
  });

  test("groupBy must name a declared select column", async () => {
    const harness = createHarness();
    const refused = await harness.call("create_database", { ...BOARD, groupBy: "Points" });
    expect(refused.isError).toBe(true);
    expect(harness.operations).toHaveLength(0);
  });
});
