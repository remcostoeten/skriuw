import { commitOperations } from "@/store/actions/workspace";
import type { NoteProperty, WorkspaceOperation } from "@/contracts/workspace";
import type { RendererStore } from "@/store/types";
import { todayKey } from "@/features/journal/dates";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
} from "@/features/journal/model";

const QUERY_KEY = "seed";
const RELATIONSHIPS_VALUE = "relationships";
const ROOT_ID = "dev-seed-relationships";

const TAGS = [
  { id: "dev-seed-tag-roadmap", name: "roadmap" },
  { id: "dev-seed-tag-design", name: "design" },
];

const PEOPLE = [
  { id: "dev-seed-person-ada", name: "Ada Lovelace" },
  { id: "dev-seed-person-grace", name: "Grace Hopper" },
];

type Chip =
  | { kind: "tag"; id: string; label: string }
  | { kind: "person"; id: string; label: string }
  | { kind: "note"; id: string; label: string };

type SeedNote = {
  id: string;
  title: string;
  text: string;
  chips: Chip[];
};

const NOTES: SeedNote[] = [
  {
    id: "dev-seed-note-editor",
    title: "Editor rewrite",
    text: "The rewrite lands behind ",
    chips: [
      { kind: "note", id: "dev-seed-note-sync", label: "Sync protocol" },
      { kind: "tag", id: "dev-seed-tag-roadmap", label: "roadmap" },
      { kind: "tag", id: "dev-seed-tag-design", label: "design" },
      { kind: "person", id: "dev-seed-person-ada", label: "Ada Lovelace" },
    ],
  },
  {
    id: "dev-seed-note-sync",
    title: "Sync protocol",
    text: "Blocked on ",
    chips: [
      { kind: "note", id: "dev-seed-note-editor", label: "Editor rewrite" },
      { kind: "tag", id: "dev-seed-tag-roadmap", label: "roadmap" },
      { kind: "person", id: "dev-seed-person-ada", label: "Ada Lovelace" },
    ],
  },
  {
    id: "dev-seed-note-review",
    title: "Design review",
    text: "Walked the flows with ",
    chips: [
      { kind: "person", id: "dev-seed-person-grace", label: "Grace Hopper" },
      { kind: "person", id: "dev-seed-person-ada", label: "Ada Lovelace" },
      { kind: "tag", id: "dev-seed-tag-design", label: "design" },
    ],
  },
  {
    id: "dev-seed-note-meeting",
    title: "Weekly sync",
    text: "Agenda item: ",
    chips: [
      { kind: "note", id: "dev-seed-note-editor", label: "Editor rewrite" },
      { kind: "tag", id: "dev-seed-tag-roadmap", label: "roadmap" },
    ],
  },
];

const JOURNAL_NOTE_ID = "dev-seed-journal-entry";

const JOURNAL_CHIPS: Chip[] = [
  { kind: "note", id: "dev-seed-note-editor", label: "Editor rewrite" },
  { kind: "tag", id: "dev-seed-tag-roadmap", label: "roadmap" },
  { kind: "person", id: "dev-seed-person-ada", label: "Ada Lovelace" },
];

function chipNode(chip: Chip): unknown {
  if (chip.kind === "tag") {
    return { type: "tag_ref", attrs: { id: chip.id, label: chip.label } };
  }
  return { type: "mention_ref", attrs: { kind: chip.kind, id: chip.id, label: chip.label } };
}

function chipMarkdown(chip: Chip): string {
  if (chip.kind === "tag") return `#${chip.label}`;
  if (chip.kind === "person") return `$${chip.label}`;
  return `[[${chip.label}]]`;
}

function emptyDocument(): unknown {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function documentJson(text: string, chips: readonly Chip[]): unknown {
  const content: unknown[] = [{ type: "text", text }];
  chips.forEach((chip, index) => {
    if (index > 0) content.push({ type: "text", text: " " });
    content.push(chipNode(chip));
  });
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

function markdown(text: string, chips: readonly Chip[]): string {
  return text + chips.map(chipMarkdown).join(" ");
}

function creationOperations(store: RendererStore, at: number): WorkspaceOperation[] {
  const state = store.getState();
  const operations: WorkspaceOperation[] = [];

  for (const tag of TAGS) {
    if (state.tags.has(tag.id)) continue;
    operations.push({
      type: "create_tag",
      tag: { ...tag, color: null, createdAt: at, updatedAt: at, createdIn: null },
    });
  }
  for (const person of PEOPLE) {
    if (state.people.has(person.id)) continue;
    operations.push({
      type: "create_person",
      person: {
        ...person,
        initials: null,
        color: null,
        note: null,
        createdAt: at,
        updatedAt: at,
        createdIn: null,
      },
    });
  }

  if (!state.sourceNodes.has(ROOT_ID)) {
    operations.push({
      type: "create_folder",
      id: ROOT_ID,
      title: "Relationship demo",
      placement: { parentId: null, position: { type: "last" } },
      at,
    });
  }
  for (const note of NOTES) {
    if (state.sourceNodes.has(note.id)) continue;
    operations.push({
      type: "create_note",
      id: note.id,
      title: note.title,
      placement: { parentId: ROOT_ID, position: { type: "last" } },
      documentJson: emptyDocument(),
      markdown: "",
      at,
    });
  }

  if (!state.sourceNodes.has(JOURNAL_NOTE_ID)) {
    if (!state.sourceNodes.has(JOURNAL_ROOT_ID)) {
      operations.push({
        type: "create_folder",
        id: JOURNAL_ROOT_ID,
        title: JOURNAL_ROOT_TITLE,
        placement: { parentId: null, position: { type: "last" } },
        at,
      });
    }
    const property: NoteProperty = {
      noteId: JOURNAL_NOTE_ID,
      id: JOURNAL_DATE_PROPERTY_ID,
      name: "Date",
      value: { valueVersion: 1, type: "date", value: todayKey() },
      options: [],
      position: 0,
    };
    operations.push(
      {
        type: "create_note",
        id: JOURNAL_NOTE_ID,
        title: "Untitled",
        placement: { parentId: JOURNAL_ROOT_ID, position: { type: "last" } },
        documentJson: emptyDocument(),
        markdown: "",
        at,
      },
      { type: "set_note_property", property, at },
    );
  }

  return operations;
}

/**
 * A note cannot link to a sibling that the same transaction has not created
 * yet — the reference writer rejects the dangling target — and two of these
 * notes link to each other. Bodies therefore land in a second commit, once
 * every target exists.
 */
function contentOperations(store: RendererStore, at: number): WorkspaceOperation[] {
  const state = store.getState();
  const bodies: { id: string; text: string; chips: readonly Chip[] }[] = [
    ...NOTES.map((note) => ({ id: note.id, text: note.text, chips: note.chips })),
    { id: JOURNAL_NOTE_ID, text: "Paired on the rewrite. ", chips: JOURNAL_CHIPS },
  ];
  const operations: WorkspaceOperation[] = [];
  for (const body of bodies) {
    const document = state.documents.get(body.id);
    if (!document || document.markdown.length > 0) continue;
    const text = markdown(body.text, body.chips);
    operations.push({
      type: "save_document",
      noteId: body.id,
      documentJson: documentJson(body.text, body.chips),
      markdown: text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      expectedRevision: document.revision,
      at,
    });
  }
  return operations;
}

/**
 * Development-only workspace fixture for the relationship surfaces, which need
 * cross-linked notes plus shared tags, people, and a journal entry — a shape no
 * starter note or importable vault produces, because nothing outside the editor
 * can create a person.
 *
 * Run it with `?seed=relationships` in the browser build. Every record carries a
 * fixed `dev-seed-` id, so re-running adds only what is missing and the whole
 * fixture is removable by trashing the "Relationship demo" folder. Release
 * builds tree-shake this to a no-op.
 */
export async function seedRelationshipFixture(store: RendererStore): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (new URLSearchParams(window.location.search).get(QUERY_KEY) !== RELATIONSHIPS_VALUE) {
    return;
  }
  const at = Date.now();
  const creations = creationOperations(store, at);
  if (creations.length > 0) {
    await commitOperations(store, creations);
  }
  const bodies = contentOperations(store, at);
  if (bodies.length > 0) {
    await commitOperations(store, bodies);
  }
}
