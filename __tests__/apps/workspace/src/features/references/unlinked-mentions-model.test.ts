import { describe, expect, test } from "vitest";
import type { WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { extractReferences } from "@skriuw/renderer-core/references/extract";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { productSchema } from "@/features/editor/schema";
import { blockRangePositions } from "@/features/editor/block-locations";
import {
  planLinkMentions,
  planUnlinkMentions,
  projectUnlinkedMentions,
  unlinkedMentionTerm,
} from "@/features/references/unlinked-mentions-model";
import { fixtureNode, fixtureSettings } from "./fixtures";

type Inline = { type: string; text?: string; marks?: unknown[]; attrs?: Record<string, unknown> };

function text(value: string, marks?: string[]): Inline {
  return marks
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value };
}

function paragraph(...content: Inline[]) {
  return { type: "paragraph", content };
}

function doc(...content: unknown[]) {
  return { type: "doc", content };
}

function noteLink(id: string, label: string): Inline {
  return { type: "mention_ref", attrs: { kind: "note", id, label } };
}

function state(
  bodies: Record<string, unknown>,
  titles: Record<string, string> = {},
): RendererState {
  const ids = ["target", ...Object.keys(bodies)];
  const snapshot: WorkspaceSnapshot = {
    protocolVersion: 1,
    activeNoteId: "target",
    nodes: ids.map((id, index) =>
      fixtureNode({
        id,
        kind: "note",
        rank: index,
        title: titles[id] ?? (id === "target" ? "Project Alpha" : `Source ${id}`),
      }),
    ),
    documents: ids.map((id) => ({
      noteId: id,
      documentJson: bodies[id] ?? doc(paragraph(text("Project Alpha is the target itself."))),
      markdown: "",
      revision: 3,
      wordCount: 1,
    })),
    historyHeaders: [],
    settings: fixtureSettings(),
  };
  return createInitialState(snapshot);
}

describe("unlinkedMentionTerm", () => {
  test("trims titles and rejects short, generic, and letterless ones", () => {
    expect(unlinkedMentionTerm("  Project   Alpha ")).toBe("Project Alpha");
    expect(unlinkedMentionTerm("AI")).toBeNull();
    expect(unlinkedMentionTerm("Untitled")).toBeNull();
    expect(unlinkedMentionTerm("untitled note")).toBeNull();
    expect(unlinkedMentionTerm("2024")).toBeNull();
    expect(unlinkedMentionTerm("Ada")).toBe("Ada");
  });
});

describe("projectUnlinkedMentions", () => {
  test("finds case-insensitive whole-word matches with a snippet", () => {
    const current = state({
      a: doc(paragraph(text("We shipped project alpha last week."))),
    });
    const [mention, ...rest] = projectUnlinkedMentions(current, "target", ["a"]);
    expect(rest).toHaveLength(0);
    expect(mention).toMatchObject({
      noteId: "a",
      title: "Source a",
      blockIndex: 0,
      from: 12,
      to: 25,
      text: "project alpha",
      before: "We shipped ",
      after: " last week.",
    });
  });

  test("skips partial words, code, links, URLs, existing note links, and the note itself", () => {
    const current = state({
      a: doc(
        paragraph(text("Project Alphabet and xProject Alpha are different.")),
        paragraph(text("Project Alpha", ["code"])),
        paragraph({
          type: "text",
          text: "Project Alpha",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        }),
        paragraph(text("See https://example.com/Project-Alpha for details.")),
        paragraph(noteLink("target", "Project Alpha")),
        { type: "code_block", content: [text("Project Alpha")] },
      ),
    });
    expect(projectUnlinkedMentions(current, "target", ["a", "target"])).toEqual([]);
  });

  test("matches inside nested blocks and across whitespace runs", () => {
    const current = state({
      a: doc({
        type: "bullet_list",
        content: [{ type: "list_item", content: [paragraph(text("Ship Project  Alpha"))] }],
      }),
    });
    const [mention] = projectUnlinkedMentions(current, "target", ["a"]);
    expect(mention?.text).toBe("Project  Alpha");
    const parsed = productSchema.nodeFromJSON(current.documents.get("a")!.documentJson);
    expect(
      blockRangePositions(parsed, mention!.blockIndex, mention!.from, mention!.to, mention!.text),
    ).not.toBeNull();
  });

  test("ignores trashed candidates and notes with ineligible titles", () => {
    const current = state({ a: doc(paragraph(text("Untitled Project Alpha"))) });
    const trashed = createInitialState({
      protocolVersion: 1,
      activeNoteId: null,
      nodes: [
        fixtureNode({ id: "target", kind: "note", title: "Project Alpha" }),
        fixtureNode({ id: "a", kind: "note", title: "A", deletedAt: 4 }),
      ],
      documents: [...current.documents.values()].map((record) => ({ ...record })),
      historyHeaders: [],
      settings: fixtureSettings(),
    });
    expect(projectUnlinkedMentions(trashed, "target", ["a"])).toEqual([]);
    const untitled = state({ a: doc(paragraph(text("Untitled things"))) }, { target: "Untitled" });
    expect(projectUnlinkedMentions(untitled, "target", ["a"])).toEqual([]);
  });

  test("caps mentions per note", () => {
    const current = state({
      a: doc(...Array.from({ length: 8 }, () => paragraph(text("Project Alpha again")))),
    });
    expect(projectUnlinkedMentions(current, "target", ["a"])).toHaveLength(5);
  });
});

describe("planLinkMentions", () => {
  test("replaces the matched text with a note link by id, keeping marks and neighbours", () => {
    const current = state({
      a: doc(paragraph(text("Before "), text("Project Alpha", ["strong"]), text(" after"))),
    });
    const mentions = projectUnlinkedMentions(current, "target", ["a"]);
    const plan = planLinkMentions(current, "target", mentions);
    expect(plan.count).toBe(1);
    const [operation] = plan.operations;
    expect(operation?.type).toBe("save_document");
    if (operation?.type !== "save_document") return;
    expect(operation.expectedRevision).toBe(3);
    expect(extractReferences(operation.documentJson)).toEqual([
      { kind: "note", targetId: "target" },
    ]);
    const linked = productSchema.nodeFromJSON(operation.documentJson);
    const mention = linked.firstChild?.child(1);
    expect(mention?.type.name).toBe("mention_ref");
    expect(mention?.attrs.label).toBe("Project Alpha");
    expect(mention?.marks.map((mark) => mark.type.name)).toEqual(["strong"]);
    expect(linked.textContent).toBe("Before  after");
    expect(operation.markdown).toContain("[[Project Alpha]]");
  });

  test("links every mention in one save per note", () => {
    const current = state({
      a: doc(paragraph(text("Project Alpha and project alpha.")), paragraph(text("PROJECT ALPHA"))),
      b: doc(paragraph(text("Project Alpha"))),
    });
    const mentions = projectUnlinkedMentions(current, "target", ["a", "b"]);
    expect(mentions).toHaveLength(4);
    const plan = planLinkMentions(current, "target", mentions);
    expect(plan.count).toBe(4);
    expect(plan.operations).toHaveLength(2);
    const store = createRendererStore(current);
    store.applyOperations(plan.operations);
    expect(projectUnlinkedMentions(store.getState(), "target", ["a", "b"])).toEqual([]);
  });

  test("links nothing when the stored text moved since the mention was found", () => {
    const before = state({ a: doc(paragraph(text("Project Alpha"))) });
    const mentions = projectUnlinkedMentions(before, "target", ["a"]);
    const after = state({ a: doc(paragraph(text("Now Project Alpha"))) });
    expect(planLinkMentions(after, "target", mentions).operations).toEqual([]);
  });
});

describe("planUnlinkMentions", () => {
  test("restores the previous body, and keeps notes edited after linking", () => {
    const current = state({
      a: doc(paragraph(text("Project Alpha"))),
      b: doc(paragraph(text("Project Alpha"))),
    });
    const plan = planLinkMentions(
      current,
      "target",
      projectUnlinkedMentions(current, "target", ["a", "b"]),
    );
    const store = createRendererStore(current);
    store.applyOperations(plan.operations);
    store.applyOperations([
      {
        type: "save_document",
        noteId: "b",
        documentJson: doc(paragraph(text("edited"))),
        markdown: "edited",
        wordCount: 1,
        expectedRevision: 3,
        at: 1,
      },
    ]);
    const undo = planUnlinkMentions(store.getState(), plan.linked);
    expect(undo.skipped).toEqual(["b"]);
    expect(undo.operations).toHaveLength(1);
    const [operation] = undo.operations;
    if (operation?.type !== "save_document") throw new Error("expected a save");
    expect(operation.noteId).toBe("a");
    expect(operation.documentJson).toBe(current.documents.get("a")!.documentJson);
    store.applyOperations(undo.operations);
    expect(projectUnlinkedMentions(store.getState(), "target", ["a"])).toHaveLength(1);
  });
});

describe("blockRangePositions", () => {
  test("rejects ranges whose text no longer matches", () => {
    const parsed = productSchema.nodeFromJSON(
      doc(paragraph(text("first")), paragraph(text("Say Project Alpha"))),
    );
    expect(blockRangePositions(parsed, 1, 5, 18, "project alpha")).toEqual({ from: 12, to: 25 });
    expect(blockRangePositions(parsed, 1, 1, 14, "project alpha")).toBeNull();
    expect(blockRangePositions(parsed, 4, 1, 2, "x")).toBeNull();
  });
});
