import { describe, expect, test } from "bun:test";
import { buildMobileStarterWorkspace, buildWebStarterContent } from "@/core/shared/starter-content";

describe("starter content", () => {
  test("builds a filled nested web starter workspace", () => {
    const starter = buildWebStarterContent();

    expect(starter.markerNoteId).toBe("starter-note-field-guide");
    expect(starter.folders.map((folder) => [folder.id, folder.parentId])).toEqual([
      ["starter-folder-studio", null],
      ["starter-folder-research", "starter-folder-studio"],
      ["starter-folder-playground", null],
      ["starter-folder-experiments", "starter-folder-playground"],
      ["starter-folder-recipes", "starter-folder-playground"],
      ["starter-folder-templates", null],
    ]);
    expect(starter.notes.map((note) => [note.id, note.parentId, note.preferredEditorMode])).toEqual(
      [
        ["starter-note-field-guide", null, "block"],
        ["starter-note-launch-review", "starter-folder-studio", "block"],
        ["starter-note-research-local-first", "starter-folder-research", "block"],
        ["starter-note-idea-board", "starter-folder-playground", "block"],
        ["starter-note-prompt-snippets", "starter-folder-experiments", "block"],
        ["starter-note-mdx-component-gallery", "starter-folder-experiments", "raw"],
        ["starter-note-mdx-space-pancakes", "starter-folder-recipes", "raw"],
        ["starter-note-daily-template", "starter-folder-templates", "block"],
        ["starter-note-meeting-template", "starter-folder-templates", "block"],
      ],
    );
  });

  test("includes rich markdown and raw MDX examples", () => {
    const starter = buildWebStarterContent();
    const mdxNote = starter.notes.find((note) => note.id === "starter-note-mdx-space-pancakes");
    const galleryNote = starter.notes.find(
      (note) => note.id === "starter-note-mdx-component-gallery",
    );
    const launchNote = starter.notes.find((note) => note.id === "starter-note-launch-review");

    expect(mdxNote?.name).toBe("MDX: Space Pancakes.mdx");
    expect(mdxNote?.content).toContain("import { Callout, Rating }");
    expect(mdxNote?.content).toContain("<Rating value={4.8}");
    expect(mdxNote?.content).toContain("[[Idea board]]");
    expect(galleryNote?.content).toContain("import { Callout, Metric, Timeline }");
    expect(galleryNote?.content).toContain("<Timeline");
    expect(launchNote?.content).toContain("| Topic | Decision | Owner |");
    expect(launchNote?.content).toContain("- [x] Replace empty-feeling demo files");
  });

  test("builds the same filled starter shape for mobile", () => {
    const starter = buildMobileStarterWorkspace();

    expect(starter.folders.map((folder) => [folder.id, folder.parentId])).toEqual([
      ["mobile-folder-studio", null],
      ["mobile-folder-research", "mobile-folder-studio"],
      ["mobile-folder-playground", null],
      ["mobile-folder-experiments", "mobile-folder-playground"],
      ["mobile-folder-recipes", "mobile-folder-playground"],
      ["mobile-folder-templates", null],
    ]);
    expect(starter.notes.map((note) => [note.id, note.parentId])).toEqual([
      ["mobile-note-field-guide", null],
      ["mobile-note-launch-review", "mobile-folder-studio"],
      ["mobile-note-research-local-first", "mobile-folder-research"],
      ["mobile-note-idea-board", "mobile-folder-playground"],
      ["mobile-note-prompt-snippets", "mobile-folder-experiments"],
      ["mobile-note-mdx-space-pancakes", "mobile-folder-recipes"],
      ["mobile-note-daily-template", "mobile-folder-templates"],
    ]);
  });
});
