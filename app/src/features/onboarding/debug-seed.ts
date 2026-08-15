import { commitOperations } from "@/store/actions/workspace";
import type { NoteProperty, WorkspaceOperation } from "@/contracts/workspace";
import type { RendererStore } from "@/store/types";
import { shiftDay, todayKey, type DateKey } from "@/features/journal/dates";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
} from "@/features/journal/model";

const QUERY_KEY = "seed";
const RELATIONSHIPS_VALUE = "relationships";

const ROOT_ID = "dev-seed-root";
const PROJECTS_ID = "dev-seed-projects";
const RESEARCH_ID = "dev-seed-research";
const ARCHIVE_ID = "dev-seed-archive";

const HUB = "dev-seed-note-editor";

const TAGS = [
  { id: "dev-seed-tag-roadmap", name: "roadmap" },
  { id: "dev-seed-tag-design", name: "design" },
  { id: "dev-seed-tag-research", name: "research" },
  { id: "dev-seed-tag-sync", name: "sync" },
  { id: "dev-seed-tag-writing", name: "writing" },
];

const PEOPLE = [
  { id: "dev-seed-person-ada", name: "Ada Lovelace" },
  { id: "dev-seed-person-grace", name: "Grace Hopper" },
  { id: "dev-seed-person-alan", name: "Alan Turing" },
  { id: "dev-seed-person-barbara", name: "Barbara Liskov" },
];

type Chip =
  | { kind: "tag"; id: string; label: string }
  | { kind: "person"; id: string; label: string }
  | { kind: "note"; id: string; label: string };

type Inline = string | Chip;

type Block =
  | { block: "paragraph"; inline: Inline[] }
  | { block: "heading"; level: number; text: string }
  | { block: "bullets"; items: Inline[][] }
  | { block: "checks"; items: { checked: boolean; text: string }[] }
  | { block: "quote"; text: string }
  | { block: "code"; params: string; text: string };

function tag(name: string): Chip {
  const record = TAGS.find((entry) => entry.name === name)!;
  return { kind: "tag", id: record.id, label: record.name };
}

function person(name: string): Chip {
  const record = PEOPLE.find((entry) => entry.name.startsWith(name))!;
  return { kind: "person", id: record.id, label: record.name };
}

function note(id: string, label: string): Chip {
  return { kind: "note", id, label };
}

function paragraph(...inline: Inline[]): Block {
  return { block: "paragraph", inline };
}

function heading(level: number, text: string): Block {
  return { block: "heading", level, text };
}

function bullets(...items: Inline[][]): Block {
  return { block: "bullets", items };
}

function checks(...items: { checked: boolean; text: string }[]): Block {
  return { block: "checks", items };
}

function quote(text: string): Block {
  return { block: "quote", text };
}

function code(params: string, text: string): Block {
  return { block: "code", params, text };
}

type SeedNote = {
  id: string;
  parentId: string;
  title: string;
  body: Block[];
};

const ARCHIVE_TOPICS = [
  "OPFS handle pool",
  "Chunk boundaries",
  "Revision conflicts",
  "Tombstone retention",
  "Bounded diagnostics",
  "Archive version 4",
  "Cover transforms",
  "Slash menu parity",
  "Toggle headings",
  "Emoji shortcodes",
  "Wikilink resolution",
  "Backlink ordering",
  "Trash cascade",
  "Restore placement",
  "Rank rebalancing",
  "Property templates",
  "Mood options",
  "Import receipts",
];

function archiveNotes(): SeedNote[] {
  return ARCHIVE_TOPICS.map((topic, index) => ({
    id: `dev-seed-archive-${String(index + 1).padStart(2, "0")}`,
    parentId: ARCHIVE_ID,
    title: topic,
    body: [
      paragraph(
        `Field note on ${topic.toLowerCase()}. Follows from `,
        note(HUB, "Editor rewrite"),
        ".",
      ),
    ],
  }));
}

const NOTES: SeedNote[] = [
  {
    id: HUB,
    parentId: PROJECTS_ID,
    title: "Editor rewrite",
    body: [
      paragraph(
        "The rewrite replaces the document pipeline end to end. Owned by ",
        person("Ada"),
        " with review from ",
        person("Grace"),
        ".",
      ),
      heading(2, "Why"),
      quote("Every keystroke path that touches disk is a keystroke path we cannot ship."),
      paragraph(
        "Blocked on ",
        note("dev-seed-note-sync", "Sync protocol"),
        " landing first, and informed by ",
        note("dev-seed-note-perf", "Performance budget"),
        ".",
      ),
      heading(2, "Scope"),
      bullets(
        ["Schema and serializer, tracked under ", tag("roadmap")],
        ["Chip rendering and parsing, tracked under ", tag("design")],
        ["Round-trip fixtures, tracked under ", tag("research")],
      ),
      heading(2, "Checklist"),
      checks(
        { checked: true, text: "Freeze the old serializer" },
        { checked: false, text: "Port the chip specs" },
        { checked: false, text: "Measure a cold open" },
      ),
      paragraph("Also touches ", tag("sync"), " and ", tag("writing"), "."),
    ],
  },
  {
    id: "dev-seed-note-sync",
    parentId: PROJECTS_ID,
    title: "Sync protocol",
    body: [
      paragraph(
        "Blocked on ",
        note(HUB, "Editor rewrite"),
        ". Driven by ",
        person("Ada"),
        " and ",
        person("Alan"),
        ".",
      ),
      heading(2, "Transport"),
      paragraph(
        "Operations above the inline ceiling travel as content-addressed chunks. See ",
        tag("sync"),
        " and ",
        tag("roadmap"),
        ".",
      ),
      code(
        "json",
        '{ "protocolVersion": 4, "chunked": true, "ceiling": 65536 }',
      ),
    ],
  },
  {
    id: "dev-seed-note-review",
    parentId: PROJECTS_ID,
    title: "Design review",
    body: [
      paragraph(
        "Walked the flows with ",
        person("Grace"),
        ", ",
        person("Ada"),
        ", and ",
        person("Barbara"),
        ".",
      ),
      bullets(
        ["Quiet section chrome stays, tagged ", tag("design")],
        ["Rail affordances need a plain-Tab path"],
        ["Empty states read as instructions, not apologies"],
      ),
    ],
  },
  {
    id: "dev-seed-note-meeting",
    parentId: PROJECTS_ID,
    title: "Weekly sync",
    body: [
      paragraph("Agenda item: ", note(HUB, "Editor rewrite"), ". Notes by ", person("Barbara"), "."),
      checks(
        { checked: true, text: "Review last week's blockers" },
        { checked: false, text: "Agree the cut line for the release" },
      ),
      paragraph("Filed under ", tag("roadmap"), "."),
    ],
  },
  {
    id: "dev-seed-note-release",
    parentId: PROJECTS_ID,
    title: "Release checklist",
    body: [
      paragraph("Gate for the next tag. Depends on ", note("dev-seed-note-sync", "Sync protocol"), "."),
      checks(
        { checked: true, text: "Contracts regenerated and committed" },
        { checked: true, text: "Migrations forward-safe" },
        { checked: false, text: "Channels published" },
      ),
      paragraph("Owner ", person("Alan"), ", tagged ", tag("roadmap"), "."),
    ],
  },
  {
    id: "dev-seed-note-perf",
    parentId: PROJECTS_ID,
    title: "Performance budget",
    body: [
      heading(2, "Navigation"),
      paragraph(
        "Navigation after startup must not wait for disk, IPC, or parsing. Feeds ",
        note(HUB, "Editor rewrite"),
        ".",
      ),
      bullets(
        ["Cold open under 400ms, tagged ", tag("research")],
        ["Keystroke to paint under one frame"],
      ),
      paragraph("Measured with ", person("Alan"), "."),
    ],
  },
  {
    id: "dev-seed-note-prior-art",
    parentId: RESEARCH_ID,
    title: "Prior art",
    body: [
      paragraph("Survey of editors that survived a schema migration. Tagged ", tag("research"), "."),
      bullets(
        ["Block-addressed documents keep history cheap"],
        ["Marker comments beat sidecar files for round-trips"],
      ),
      paragraph("Compiled by ", person("Barbara"), "."),
    ],
  },
  {
    id: "dev-seed-note-vocabulary",
    parentId: RESEARCH_ID,
    title: "Shared vocabulary",
    body: [
      paragraph(
        "Naming pass so ",
        note(HUB, "Editor rewrite"),
        " and ",
        note("dev-seed-note-sync", "Sync protocol"),
        " agree on terms.",
      ),
      bullets(
        ["Operation, not mutation"],
        ["Projection, not cache"],
        ["Candidate, not neighbour"],
      ),
      paragraph("Tagged ", tag("writing"), " with ", person("Grace"), "."),
    ],
  },
  {
    id: "dev-seed-note-glossary",
    parentId: RESEARCH_ID,
    title: "Glossary",
    body: [
      paragraph("Terms that keep drifting. Tagged ", tag("writing"), " and ", tag("research"), "."),
      bullets([
        "Detached task: a record whose source link disappeared, per ADR 0031",
      ]),
    ],
  },
  ...archiveNotes(),
];

type JournalSeed = {
  id: string;
  dateKey: DateKey;
  body: Block[];
};

function journalSeeds(): JournalSeed[] {
  return [
    {
      id: "dev-seed-journal-0",
      dateKey: todayKey(),
      body: [
        paragraph(
          "Paired on ",
          note(HUB, "Editor rewrite"),
          " most of the afternoon with ",
          person("Ada"),
          ".",
        ),
        bullets([
          "The chip parser is the last blocker before the cut, tagged ",
          tag("roadmap"),
        ]),
      ],
    },
    {
      id: "dev-seed-journal-1",
      dateKey: shiftDay(todayKey(), -1),
      body: [
        paragraph(
          "Read through the survey with ",
          person("Ada"),
          ". Filed under ",
          tag("research"),
          " and ",
          tag("roadmap"),
          ".",
        ),
      ],
    },
    {
      id: "dev-seed-journal-2",
      dateKey: shiftDay(todayKey(), -3),
      body: [
        paragraph("Quiet day. Sketched the rail with ", person("Grace"), " under ", tag("design"), "."),
      ],
    },
  ];
}

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

function inlineJson(inline: readonly Inline[]): unknown[] {
  return inline.map((entry) =>
    typeof entry === "string" ? { type: "text", text: entry } : chipNode(entry),
  );
}

function inlineMarkdown(inline: readonly Inline[]): string {
  return inline.map((entry) => (typeof entry === "string" ? entry : chipMarkdown(entry))).join("");
}

function blockJson(block: Block): unknown {
  if (block.block === "heading") {
    return {
      type: "heading",
      attrs: { level: block.level },
      content: [{ type: "text", text: block.text }],
    };
  }
  if (block.block === "bullets") {
    return {
      type: "bullet_list",
      content: block.items.map((item) => ({
        type: "list_item",
        content: [{ type: "paragraph", content: inlineJson(item) }],
      })),
    };
  }
  if (block.block === "checks") {
    return {
      type: "check_list",
      content: block.items.map((item) => ({
        type: "check_item",
        attrs: { checked: item.checked, taskId: null, blockId: null },
        content: [{ type: "paragraph", content: [{ type: "text", text: item.text }] }],
      })),
    };
  }
  if (block.block === "quote") {
    return {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: block.text }] }],
    };
  }
  if (block.block === "code") {
    return {
      type: "code_block",
      attrs: { params: block.params },
      content: [{ type: "text", text: block.text }],
    };
  }
  return { type: "paragraph", content: inlineJson(block.inline) };
}

function blockMarkdown(block: Block): string {
  if (block.block === "heading") return `${"#".repeat(block.level)} ${block.text}`;
  if (block.block === "bullets") {
    return block.items.map((item) => `- ${inlineMarkdown(item)}`).join("\n");
  }
  if (block.block === "checks") {
    return block.items.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`).join("\n");
  }
  if (block.block === "quote") return `> ${block.text}`;
  if (block.block === "code") return `\`\`\`${block.params}\n${block.text}\n\`\`\``;
  return inlineMarkdown(block.inline);
}

function documentJson(body: readonly Block[]): unknown {
  return { type: "doc", content: body.map(blockJson) };
}

function markdown(body: readonly Block[]): string {
  return body.map(blockMarkdown).join("\n\n");
}

function emptyDocument(): unknown {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * Trashing a folder stamps `deletedAt` on the folder alone, so a fixture note
 * whose ancestor was trashed still reads as live on its own record. The seed
 * walks the chain the way the workspace does and leaves a trashed fixture note
 * alone: reviving it would mean restoring the directly-trashed ancestor, which
 * is the workspace's decision to make, not the fixture's.
 */
function trashed(store: RendererStore, id: string): boolean {
  const state = store.getState();
  let node = state.sourceNodes.get(id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (node.deletedAt !== null) return true;
    seen.add(node.id);
    node = node.parentId === null ? undefined : state.sourceNodes.get(node.parentId);
  }
  return false;
}

function folder(id: string, title: string, parentId: string | null, at: number): WorkspaceOperation {
  return {
    type: "create_folder",
    id,
    title,
    placement: { parentId, position: { type: "last" } },
    at,
  };
}

function creationOperations(store: RendererStore, at: number): WorkspaceOperation[] {
  const state = store.getState();
  const operations: WorkspaceOperation[] = [];

  for (const record of TAGS) {
    if (state.tags.has(record.id)) continue;
    operations.push({
      type: "create_tag",
      tag: { ...record, color: null, createdAt: at, updatedAt: at, createdIn: null },
    });
  }
  for (const record of PEOPLE) {
    if (state.people.has(record.id)) continue;
    operations.push({
      type: "create_person",
      person: {
        ...record,
        initials: null,
        color: null,
        note: null,
        createdAt: at,
        updatedAt: at,
        createdIn: null,
      },
    });
  }

  const folders: [string, string, string | null][] = [
    [ROOT_ID, "Relationship demo", null],
    [PROJECTS_ID, "Projects", ROOT_ID],
    [RESEARCH_ID, "Research", ROOT_ID],
    [ARCHIVE_ID, "Archive", ROOT_ID],
  ];
  for (const [id, title, parentId] of folders) {
    if (state.sourceNodes.has(id)) continue;
    operations.push(folder(id, title, parentId, at));
  }

  for (const seed of NOTES) {
    const existing = state.sourceNodes.get(seed.id);
    if (existing) {
      if (trashed(store, seed.id)) continue;
      if (existing.parentId !== seed.parentId) {
        operations.push({
          type: "move_node",
          id: seed.id,
          placement: { parentId: seed.parentId, position: { type: "last" } },
          at,
        });
      }
      if (existing.title !== seed.title) {
        operations.push({ type: "rename_node", id: seed.id, title: seed.title, at });
      }
      continue;
    }
    operations.push({
      type: "create_note",
      id: seed.id,
      title: seed.title,
      placement: { parentId: seed.parentId, position: { type: "last" } },
      documentJson: emptyDocument(),
      markdown: "",
      at,
    });
  }

  const journalMissing = journalSeeds().filter((entry) => !state.sourceNodes.has(entry.id));
  if (journalMissing.length > 0 && !state.sourceNodes.has(JOURNAL_ROOT_ID)) {
    operations.push(folder(JOURNAL_ROOT_ID, JOURNAL_ROOT_TITLE, null, at));
  }
  for (const entry of journalMissing) {
    const property: NoteProperty = {
      noteId: entry.id,
      id: JOURNAL_DATE_PROPERTY_ID,
      name: "Date",
      value: { valueVersion: 1, type: "date", value: entry.dateKey },
      options: [],
      position: 0,
    };
    operations.push(
      {
        type: "create_note",
        id: entry.id,
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
 * yet — the reference writer rejects the dangling target — and several of these
 * notes link to each other. Bodies therefore land in a second commit, once
 * every target exists.
 *
 * Bodies are rewritten rather than filled in only when empty, so re-running the
 * seed after editing the fixture definition refreshes an existing workspace
 * instead of leaving stale content behind.
 */
function contentOperations(store: RendererStore, at: number): WorkspaceOperation[] {
  const state = store.getState();
  const bodies: { id: string; body: Block[] }[] = [
    ...NOTES.map((seed) => ({ id: seed.id, body: seed.body })),
    ...journalSeeds().map((entry) => ({ id: entry.id, body: entry.body })),
  ];
  const operations: WorkspaceOperation[] = [];
  for (const entry of bodies) {
    const document = state.documents.get(entry.id);
    if (!document) continue;
    const text = markdown(entry.body);
    if (document.markdown === text) continue;
    operations.push({
      type: "save_document",
      noteId: entry.id,
      documentJson: documentJson(entry.body),
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
 * cross-linked notes plus shared tags, people, and journal entries — a shape no
 * starter note or importable vault produces, because nothing outside the editor
 * can create a person.
 *
 * The archive notes exist to push "Editor rewrite" past both bounds the panel
 * enforces: more rows than a section shows at once, and more neighbours than
 * the local graph draws, so "Show all" and the hidden-relationship count are
 * both reachable without hand-building a workspace.
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
