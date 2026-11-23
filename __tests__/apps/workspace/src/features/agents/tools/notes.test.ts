import { describe, expect, test } from "vitest";
import { createHarness } from "../harness";

const SEEDS = [
  { id: "projects", kind: "folder", title: "Projects" },
  { id: "launch", kind: "folder", title: "Launch", parentId: "projects" },
  { id: "plan", kind: "note", title: "Plan", parentId: "launch", markdown: "# Plan\n\nShip it." },
  { id: "inbox", kind: "note", title: "Inbox", markdown: "# Inbox\n" },
  { id: "secret", kind: "note", title: "Secret", lockedAt: 5 },
] as const;

describe("agent note tools", () => {
  test("list_workspace returns the nested tree and stops at the requested depth", async () => {
    const harness = createHarness([...SEEDS]);
    const deep = await harness.ok("list_workspace");
    expect(deep.items[0]).toMatchObject({
      id: "projects",
      kind: "folder",
      children: [{ id: "launch", children: [{ id: "plan", kind: "note", title: "Plan" }] }],
    });
    const shallow = await harness.ok("list_workspace", { depth: 1 });
    expect(shallow.items[0]).toEqual({
      id: "projects",
      kind: "folder",
      title: "Projects",
      childCount: 1,
    });
  });

  test("create_note titles the note from a heading and places it in the folder", async () => {
    const harness = createHarness([...SEEDS]);
    const created = await harness.ok("create_note", {
      title: "Retro",
      markdown: "Went well.\n\n- [ ] Follow up",
      parentId: "launch",
    });
    expect(created.path).toBe("Projects / Launch / Retro");
    const read = await harness.ok("read_note", { noteId: created.id });
    expect(read.markdown).toContain("# Retro");
    expect(read.markdown).toContain("Went well.");
    expect(read.parentId).toBe("launch");
  });

  test("create_note keeps a body that already opens with a heading", async () => {
    const harness = createHarness();
    const created = await harness.ok("create_note", {
      title: "Ignored",
      markdown: "## Own heading\n\nText",
    });
    expect(created.title).toBe("Own heading");
  });

  test("write_note appends and prepends around the existing body", async () => {
    const harness = createHarness([...SEEDS]);
    await harness.ok("write_note", { noteId: "plan", mode: "append", markdown: "Then celebrate." });
    await harness.ok("write_note", { noteId: "plan", mode: "prepend", markdown: "# Launch plan" });
    const read = await harness.ok("read_note", { noteId: "plan" });
    expect(read.markdown.indexOf("# Launch plan")).toBeLessThan(read.markdown.indexOf("Ship it."));
    expect(read.markdown.indexOf("Ship it.")).toBeLessThan(
      read.markdown.indexOf("Then celebrate."),
    );
    expect(read.title).toBe("Launch plan");
  });

  test("write_note replace renames the note when the first heading changes", async () => {
    const harness = createHarness([...SEEDS]);
    await harness.ok("write_note", {
      noteId: "plan",
      mode: "replace",
      markdown: "# Roadmap\n\nQ1",
    });
    expect(harness.store.getState().sourceNodes.get("plan")?.title).toBe("Roadmap");
    expect(harness.operations.some((operation) => operation.type === "save_document")).toBe(true);
  });

  test("locked notes are refused for reading and writing", async () => {
    const harness = createHarness([...SEEDS]);
    expect((await harness.call("read_note", { noteId: "secret" })).text).toContain("locked");
    expect(
      (await harness.call("write_note", { noteId: "secret", mode: "append", markdown: "x" }))
        .isError,
    ).toBe(true);
  });

  test("move_items moves notes into a folder in order and refuses a folder into itself", async () => {
    const harness = createHarness([...SEEDS]);
    const moved = await harness.ok("move_items", { ids: ["inbox", "plan"], parentId: "projects" });
    expect(moved).toEqual([
      { id: "inbox", path: "Projects / Inbox" },
      { id: "plan", path: "Projects / Plan" },
    ]);
    const children = harness.store.getState().childrenByParent.get("projects");
    expect(children?.indexOf("inbox")).toBeLessThan(children!.indexOf("plan"));
    const loop = await harness.call("move_items", { ids: ["projects"], parentId: "launch" });
    expect(loop.isError).toBe(true);
    expect(loop.text).toContain("cannot move into itself");
  });

  test("trash_items trashes only the outermost roots and restore_items brings them back", async () => {
    const harness = createHarness([...SEEDS]);
    const trashed = await harness.ok("trash_items", { ids: ["plan", "projects"] });
    expect(trashed.trashed.map((entry: { id: string }) => entry.id)).toEqual(["projects"]);
    expect(harness.store.getState().nodes.has("plan")).toBe(false);
    expect((await harness.call("read_note", { noteId: "plan" })).text).toContain("trash");
    await harness.ok("restore_items", { ids: ["projects"] });
    expect(harness.store.getState().nodes.has("plan")).toBe(true);
    expect(harness.operations.some((operation) => operation.type === "purge_subtree")).toBe(false);
  });

  test("search_notes hides locked and trashed notes and adds paths", async () => {
    const harness = createHarness(
      [...SEEDS, { id: "old", kind: "note", title: "Old", deletedAt: 9 }],
      [
        { noteId: "plan", title: "Plan", snippet: "Ship", score: 2 },
        { noteId: "secret", title: "Secret", snippet: "x", score: 1 },
        { noteId: "old", title: "Old", snippet: "y", score: 1 },
      ],
    );
    const hits = await harness.ok("search_notes", { query: "ship" });
    expect(hits).toEqual([
      { noteId: "plan", title: "Plan", path: "Projects / Launch / Plan", snippet: "Ship" },
    ]);
  });
});
