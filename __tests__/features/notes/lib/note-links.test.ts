import { describe, expect, test } from "bun:test";
import {
  buildNoteBacklinks,
  buildNoteLinkIndex,
  buildOutgoingNoteLinks,
  extractNoteLinks,
  extractNoteTags,
  getNoteTitle,
  getWorkspaceTags,
} from "@/features/notes/lib/note-links";
import type { NoteFile } from "@/types/notes";

function note(input: Partial<NoteFile> & Pick<NoteFile, "id" | "name" | "content">): NoteFile {
  const now = new Date("2026-05-07T10:00:00.000Z");

  return {
    richContent: [],
    preferredEditorMode: "raw",
    createdAt: now,
    modifiedAt: now,
    parentId: null,
    ...input,
  };
}

describe("note link indexing", () => {
  test("extracts tags without reading code spans", () => {
    expect(extractNoteTags("Ship #writing and #Product\n`#ignored`")).toEqual([
      "product",
      "writing",
    ]);
  });

  test("extracts wiki links and internal markdown note links", () => {
    expect(
      extractNoteLinks(
        note({
          id: "source",
          name: "Source.md",
          content: "See [[Target note|target]] and [Target](note://target-id).",
        }),
      ),
    ).toMatchObject([
      {
        kind: "wiki",
        targetLabel: "Target note",
        alias: "target",
      },
      {
        kind: "markdown-note-link",
        targetLabel: "Target",
        targetNoteId: "target-id",
      },
    ]);
  });

  test("builds outgoing links and backlinks", () => {
    const target = note({ id: "target-id", name: "Target note.md", content: "#target" });
    const source = note({
      id: "source-id",
      name: "Source.md",
      content: "Backlink to [[Target note]].",
    });

    const index = buildNoteLinkIndex(target, [target, source]);

    expect(index.backlinks).toHaveLength(1);
    expect(index.backlinks[0]).toMatchObject({
      sourceNoteId: "source-id",
      targetNoteId: "target-id",
      status: "resolved",
    });
  });

  test("builds outgoing links without backlink sources", () => {
    const target = note({
      id: "target-id",
      name: "Target.md",
      content: "# Target\n\nSee [[Source]].",
    });
    const source = note({
      id: "source-id",
      name: "Source.md",
      content: "# Source\n\nBacklink to [[Target]].",
    });

    const outgoing = buildOutgoingNoteLinks(target, [target, source]);

    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]).toMatchObject({
      sourceNoteId: "target-id",
      targetNoteId: "source-id",
      status: "resolved",
    });
  });

  test("builds backlinks with a single note graph pass", () => {
    const target = note({
      id: "target-id",
      name: "Target.md",
      content: "# Target\n\n",
    });
    const source = note({
      id: "source-id",
      name: "Source.md",
      content: "# Source\n\nBacklink to [[Target]].",
    });

    const backlinks = buildNoteBacklinks(target, [target, source]);

    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]).toMatchObject({
      sourceNoteId: "source-id",
      targetNoteId: "target-id",
      status: "resolved",
    });
  });

  test("resolves links against markdown headings as note titles", () => {
    const target = note({
      id: "target-id",
      name: "Start here - editor field guide.md",
      content: "# Start here: editor field guide\n\nWelcome.",
    });
    const source = note({
      id: "source-id",
      name: "Source.md",
      content: "Backlink to [[Start here: editor field guide]].",
    });

    const index = buildNoteLinkIndex(target, [target, source]);

    expect(getNoteTitle(target)).toBe("Start here: editor field guide");
    expect(index.backlinks[0]).toMatchObject({
      sourceNoteId: "source-id",
      targetNoteId: "target-id",
      status: "resolved",
    });
  });

  test("uses mdx filenames as fallback titles", () => {
    expect(getNoteTitle(note({ id: "mdx", name: "Component gallery.mdx", content: "" }))).toBe(
      "Component gallery",
    );
  });

  test("collects workspace tags from explicit tags and content tags", () => {
    expect(
      getWorkspaceTags([
        note({ id: "a", name: "A.md", content: "#draft", tags: ["manual"] }),
        note({ id: "b", name: "B.md", content: "#idea #manual" }),
      ]),
    ).toEqual(["draft", "idea", "manual"]);
  });
});
