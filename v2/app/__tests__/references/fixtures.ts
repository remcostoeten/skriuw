import type {
  WorkspaceNode,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from "../../src/contracts/workspace";
import type {
  NoteReferences,
  PersonRecord,
  ReferenceBootstrap,
  StructuredReference,
  TagRecord,
} from "../../src/references/types";

export function fixtureSettings(): WorkspaceSettings {
  return {
    settingsVersion: 1,
    theme: "system",
    compactSidebar: false,
    showPageIcons: true,
    reduceMotion: false,
    rememberLastNote: true,
    editorFont: "sans",
    editorLineHeight: "1.6",
    showLineNumbers: false,
    editorPlaceholder: "Start writing",
  };
}

export function fixtureNode(
  partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">,
): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...partial,
  };
}

export function tag(id: string, name: string): TagRecord {
  return { id, name, color: null, createdAt: 0, updatedAt: 0, createdIn: null };
}

export function person(id: string, name: string): PersonRecord {
  return {
    id,
    name,
    initials: null,
    color: null,
    note: null,
    createdAt: 0,
    updatedAt: 0,
    createdIn: null,
  };
}

function referenceJson(reference: StructuredReference): unknown {
  if (reference.kind === "tag") {
    return { type: "tag_ref", attrs: { id: reference.targetId, label: reference.targetId } };
  }
  return {
    type: "mention_ref",
    attrs: { kind: reference.kind, id: reference.targetId, label: reference.targetId },
  };
}

export function referenceDocumentJson(
  targets: readonly StructuredReference[],
  text = "body",
): unknown {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }, ...targets.map(referenceJson)],
      },
    ],
  };
}

export type ReferenceFixture = {
  snapshot: WorkspaceSnapshot;
  references: ReferenceBootstrap;
};

export function referenceFixture(): ReferenceFixture {
  const noteReferences: NoteReferences[] = [
    {
      noteId: "note-b",
      targets: [
        { kind: "note", targetId: "note-a" },
        { kind: "tag", targetId: "tag-alpha" },
        { kind: "person", targetId: "person-ada" },
      ],
    },
    {
      noteId: "note-c",
      targets: [
        { kind: "note", targetId: "note-a" },
        { kind: "tag", targetId: "tag-alpha" },
      ],
    },
  ];
  return {
    snapshot: {
      protocolVersion: 1,
      activeNoteId: "note-a",
      nodes: [
        fixtureNode({ id: "note-a", kind: "note", rank: 100, title: "Alpha note" }),
        fixtureNode({ id: "note-b", kind: "note", rank: 200, title: "Beta note" }),
        fixtureNode({ id: "note-c", kind: "note", rank: 300, title: "Gamma note" }),
        fixtureNode({
          id: "note-trashed",
          kind: "note",
          rank: 400,
          title: "Trashed note",
          deletedAt: 5,
        }),
      ],
      documents: [
        {
          noteId: "note-a",
          documentJson: referenceDocumentJson([]),
          markdown: "",
          revision: 1,
          wordCount: 1,
        },
        {
          noteId: "note-b",
          documentJson: referenceDocumentJson(noteReferences[0]?.targets ?? []),
          markdown: "",
          revision: 1,
          wordCount: 1,
        },
        {
          noteId: "note-c",
          documentJson: referenceDocumentJson(noteReferences[1]?.targets ?? []),
          markdown: "",
          revision: 1,
          wordCount: 1,
        },
        {
          noteId: "note-trashed",
          documentJson: referenceDocumentJson([]),
          markdown: "",
          revision: 1,
          wordCount: 1,
        },
      ],
      historyHeaders: [],
      settings: fixtureSettings(),
    },
    references: {
      tags: [tag("tag-alpha", "alpha"), tag("tag-beta", "beta")],
      people: [person("person-ada", "Ada"), person("person-bob", "Bob")],
      references: noteReferences,
    },
  };
}

export type LargeFixtureOptions = {
  noteCount: number;
  tagCount: number;
  personCount: number;
  referencesPerNote: number;
};

export function largeReferenceFixture(options: LargeFixtureOptions): ReferenceFixture {
  const nodes: WorkspaceNode[] = [];
  const documents: WorkspaceSnapshot["documents"] = [];
  const noteReferences: NoteReferences[] = [];
  const tags = Array.from({ length: options.tagCount }, (_, index) =>
    tag(`tag-${index}`, `tag ${index.toString().padStart(4, "0")}`),
  );
  const people = Array.from({ length: options.personCount }, (_, index) =>
    person(`person-${index}`, `person ${index.toString().padStart(4, "0")}`),
  );
  for (let index = 0; index < options.noteCount; index += 1) {
    const id = `note-${index}`;
    nodes.push(
      fixtureNode({
        id,
        kind: "note",
        rank: index,
        title: `Note ${index.toString().padStart(5, "0")}`,
      }),
    );
    const targets: StructuredReference[] = [];
    for (let reference = 0; reference < options.referencesPerNote; reference += 1) {
      const pick = (index + reference) % 3;
      if (pick === 0 && tags.length > 0) {
        targets.push({
          kind: "tag",
          targetId: `tag-${(index + reference) % tags.length}`,
        });
      } else if (pick === 1 && people.length > 0) {
        targets.push({
          kind: "person",
          targetId: `person-${(index + reference) % people.length}`,
        });
      } else {
        targets.push({
          kind: "note",
          targetId: `note-${(index + reference + 1) % options.noteCount}`,
        });
      }
    }
    documents.push({
      noteId: id,
      documentJson: referenceDocumentJson(targets),
      markdown: "",
      revision: 1,
      wordCount: 1,
    });
    noteReferences.push({ noteId: id, targets });
  }
  return {
    snapshot: {
      protocolVersion: 1,
      activeNoteId: "note-0",
      nodes,
      documents,
      historyHeaders: [],
      settings: fixtureSettings(),
    },
    references: { tags, people, references: noteReferences },
  };
}
