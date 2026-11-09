import type { WorkspaceAnnotation, WorkspaceTask } from "@skriuw/renderer-core/contracts/workspace";

type AttributeValue = string | number | boolean | null;

type MarkJson = {
  type: string;
  attrs?: { [name: string]: AttributeValue };
};

export type NodeJson = {
  type: string;
  attrs?: { [name: string]: AttributeValue };
  content?: NodeJson[];
  text?: string;
  marks?: MarkJson[];
};

export type ContentReferences = {
  tags: readonly { id: string; name: string }[];
  people: readonly { id: string; name: string }[];
  notes: readonly { id: string; title: string }[];
};

export type GeneratedDocument = {
  json: NodeJson;
  text: string;
  wordCount: number;
  tagIds: string[];
  personIds: string[];
  linkedNoteIds: string[];
  mentionedNoteIds: string[];
  annotations: WorkspaceAnnotation[];
  tasks: WorkspaceTask[];
};

const FIXTURE_TIME = 1_753_000_000_000;
const TAG_FAN_OUT_POOL = 40;
const MEASURED_NOTE_POOL = 8;
const UNLINKED_MENTION_CYCLE = 25;

const WORDS = [
  "the",
  "draft",
  "review",
  "outline",
  "release",
  "notes",
  "meeting",
  "decision",
  "latency",
  "budget",
  "keyboard",
  "sidebar",
  "workspace",
  "renderer",
  "history",
  "journal",
  "schema",
  "follow-up",
  "migration",
  "index",
  "summary",
  "question",
  "answer",
  "context",
  "and",
  "with",
  "for",
  "after",
  "before",
  "because",
  "while",
  "during",
] as const;

const CODE_LINES = [
  "export function measureSwitch(store: RendererStore, noteId: string): number {",
  "  const started = performance.now();",
  "  flushSync(() => store.setActiveNote(noteId));",
  "  return performance.now() - started;",
  "}",
  "",
  "const fixtures = new Map<string, number>([",
  '  ["wide-1000", 1_000],',
  '  ["wide-5000", 5_000],',
  "]);",
  "",
  "for (const [name, notes] of fixtures) {",
  "  console.info(`${name}: ${notes} notes`);",
  "}",
] as const;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function sentence(random: () => number, length: number): string {
  const words = Array.from({ length }, () => WORDS[Math.floor(random() * WORDS.length)] ?? "note");
  return words.join(" ");
}

function text(value: string, marks?: MarkJson[]): NodeJson {
  return marks && marks.length > 0
    ? { type: "text", text: value, marks }
    : { type: "text", text: value };
}

function paragraph(content: NodeJson[]): NodeJson {
  return { type: "paragraph", content };
}

function countWords(value: string): number {
  return value.split(/\s+/u).filter((word) => word.length > 0).length;
}

class DocumentBuilder {
  readonly blocks: NodeJson[] = [];
  readonly textParts: string[] = [];
  readonly tagIds = new Set<string>();
  readonly personIds = new Set<string>();
  readonly linkedNoteIds = new Set<string>();
  readonly mentionedNoteIds = new Set<string>();
  readonly annotations: WorkspaceAnnotation[] = [];
  readonly tasks: WorkspaceTask[] = [];

  constructor(
    readonly noteId: string,
    readonly noteIndex: number,
    readonly references: ContentReferences,
  ) {}

  record(value: string): string {
    this.textParts.push(value);
    return value;
  }

  tag(offset: number): NodeJson {
    const tag =
      offset % 2 === 0
        ? this.references.tags[(this.noteIndex + offset) % TAG_FAN_OUT_POOL]
        : this.references.tags[(this.noteIndex * 7 + offset) % this.references.tags.length];
    if (!tag) throw new Error("fixture content requires tags");
    this.tagIds.add(tag.id);
    this.record(`#${tag.name}`);
    return { type: "tag_ref", attrs: { id: tag.id, label: tag.name } };
  }

  person(offset: number): NodeJson {
    const person =
      this.references.people[(this.noteIndex * 13 + offset) % this.references.people.length];
    if (!person) throw new Error("fixture content requires people");
    this.personIds.add(person.id);
    this.record(`$${person.name}`);
    return { type: "mention_ref", attrs: { kind: "person", id: person.id, label: person.name } };
  }

  noteLink(offset: number): NodeJson {
    const notes = this.references.notes;
    const target = notes[(this.noteIndex * 31 + offset * 17 + 1) % notes.length];
    if (!target) throw new Error("fixture content requires notes");
    const resolved =
      target.id === this.noteId ? notes[(this.noteIndex + 1) % notes.length] : target;
    if (!resolved) throw new Error("fixture content requires two notes");
    this.linkedNoteIds.add(resolved.id);
    this.record(`@${resolved.title}`);
    return { type: "mention_ref", attrs: { kind: "note", id: resolved.id, label: resolved.title } };
  }

  unlinkedMention(): NodeJson | null {
    if (this.noteIndex < MEASURED_NOTE_POOL) return null;
    const slot = this.noteIndex % UNLINKED_MENTION_CYCLE;
    const target = slot < MEASURED_NOTE_POOL ? this.references.notes[slot] : undefined;
    if (!target) return null;
    this.mentionedNoteIds.add(target.id);
    return text(this.record(` as discussed in ${target.title}, `));
  }

  annotation(anchor: string, blockNumber: number): MarkJson {
    const id = `${this.noteId}-annotation-${blockNumber}`
      .replace(/[^A-Za-z0-9_-]/gu, "-")
      .slice(0, 64);
    const at = FIXTURE_TIME + this.noteIndex * 1_000 + blockNumber;
    this.annotations.push({
      id,
      noteId: this.noteId,
      status: blockNumber % 2 === 0 ? "open" : "resolved",
      anchorText: anchor,
      createdAt: at,
      resolvedAt: blockNumber % 2 === 0 ? null : at + 60_000,
      comments: [
        {
          id: `${id}-c1`,
          bodyMarkdown: `Check the ${anchor} wording before the release review.`,
          authorId: null,
          createdAt: at,
          updatedAt: at,
        },
      ],
    });
    return { type: "annotation", attrs: { threadId: id } };
  }

  richParagraph(marker: string, index: number, random: () => number): NodeJson {
    const content: NodeJson[] = [text(this.record(`${marker} `))];
    content.push(text(this.record(sentence(random, 6))));
    content.push(text(" "));
    content.push(text(this.record(sentence(random, 2)), [{ type: "strong" }]));
    content.push(text(this.record(` ${sentence(random, 5)} `)));
    content.push(text(this.record(sentence(random, 2)), [{ type: "em" }]));
    content.push(text(this.record(` ${sentence(random, 4)} `)));
    if (index % 3 === 0) {
      content.push(this.tag(index), text(" "));
    }
    if (index % 5 === 0) {
      content.push(this.noteLink(index), text(" "));
    }
    if (index % 7 === 0) {
      content.push(this.person(index), text(" "));
    }
    if (index % 4 === 0) {
      content.push(text(this.record("renderStore()"), [{ type: "code" }]), text(" "));
    }
    if (index % 9 === 0) {
      content.push(
        text(this.record("the release checklist"), [
          { type: "link", attrs: { href: `https://example.com/checklist/${index}`, title: null } },
        ]),
        text(" "),
      );
    }
    if (index % 13 === 0) {
      const anchor = this.record(sentence(random, 3));
      content.push(text(anchor, [this.annotation(anchor, index)]), text(" "));
    }
    if (index % 11 === 0) {
      content.push(
        text(this.record(sentence(random, 2)), [{ type: "highlight", attrs: { color: "yellow" } }]),
        text(" "),
      );
    }
    if (index % 6 === 0) {
      const mention = this.unlinkedMention();
      if (mention) content.push(mention);
    }
    content.push(text(this.record(`${sentence(random, 8)}.`)));
    return paragraph(content);
  }

  listItems(marker: string, random: () => number, count: number): NodeJson[] {
    return Array.from({ length: count }, (_, item) => ({
      type: "list_item",
      content: [
        paragraph([
          text(this.record(item === 0 ? `${marker} ${sentence(random, 5)}` : sentence(random, 7))),
        ]),
      ],
    }));
  }

  checkList(marker: string, index: number, random: () => number): NodeJson {
    const items = Array.from({ length: 3 }, (_, item) => {
      const title = this.record(
        item === 0 ? `${marker} ${sentence(random, 4)}` : sentence(random, 5),
      );
      const checked = (index + item) % 3 === 0;
      const linked = item !== 2;
      const blockId = `${this.noteId}-block-${index}-${item}`;
      const taskId = `${this.noteId}-task-${index}-${item}`;
      if (linked) {
        const at = FIXTURE_TIME + this.noteIndex * 1_000 + index;
        this.tasks.push({
          id: taskId,
          title,
          status: checked ? "done" : "todo",
          priority: "medium",
          dueDate: null,
          description: "",
          tagIds: [],
          assigneeIds: [],
          source: { noteId: this.noteId, blockId },
          detachedAt: null,
          createdAt: at,
          updatedAt: at,
        });
      }
      return {
        type: "check_item",
        attrs: {
          checked,
          taskId: linked ? taskId : null,
          blockId: linked ? blockId : null,
          dueDate: null,
          recurrence: null,
        },
        content: [paragraph([text(title)])],
      };
    });
    return { type: "check_list", content: items };
  }

  codeBlock(marker: string, lines: number): NodeJson {
    const body = [`// ${marker}`];
    for (let line = 0; body.length < lines; line += 1) {
      body.push(CODE_LINES[line % CODE_LINES.length] ?? "");
    }
    return {
      type: "code_block",
      attrs: { params: "typescript" },
      content: [text(this.record(body.join("\n")))],
    };
  }

  block(marker: string, index: number, random: () => number): NodeJson {
    if (index === 0) {
      return paragraph([
        text(this.record(`${marker} carries deterministic product text.`)),
        text(this.record("linked words"), [
          { type: "link", attrs: { href: "https://example.com", title: null } },
        ]),
        text(this.record(` ${sentence(random, 10)}.`)),
      ]);
    }
    switch (index % 20) {
      case 1:
      case 11:
        return {
          type: "heading",
          attrs: { level: index % 20 === 1 ? 2 : 3 },
          content: [text(this.record(`${marker}: ${sentence(random, 4)}`))],
        };
      case 4:
        return { type: "bullet_list", content: this.listItems(marker, random, 3) };
      case 8:
        return this.checkList(marker, index, random);
      case 14:
        return {
          type: "ordered_list",
          attrs: { order: 1 },
          content: this.listItems(marker, random, 3),
        };
      case 17:
        return index % 40 === 17
          ? this.codeBlock(marker, 72)
          : this.richParagraph(marker, index, random);
      case 19:
        return {
          type: "blockquote",
          content: [paragraph([text(this.record(`${marker} ${sentence(random, 14)}.`))])],
        };
      default:
        return this.richParagraph(marker, index, random);
    }
  }

  result(): GeneratedDocument {
    const plain = this.textParts.join(" ");
    return {
      json: { type: "doc", content: this.blocks },
      text: plain,
      wordCount: countWords(plain),
      tagIds: [...this.tagIds],
      personIds: [...this.personIds],
      linkedNoteIds: [...this.linkedNoteIds],
      mentionedNoteIds: [...this.mentionedNoteIds],
      annotations: this.annotations,
      tasks: this.tasks,
    };
  }
}

/**
 * @name measuredDocument
 * @description Builds the varied body of a measured note: headings every ten blocks, rich
 * paragraphs with marks, tags, note and person references, annotations and links, bullet,
 * ordered and task lists, quotes, and a 72-line code block every forty blocks. Every top-level
 * block's text starts with `Block N in measured note M` so window checks can read its index.
 * @example
 * const generated = measuredDocument("note-1", 0, 0, 150, references);
 */
export function measuredDocument(
  noteId: string,
  noteIndex: number,
  measuredIndex: number,
  blockCount: number,
  references: ContentReferences,
): GeneratedDocument {
  const builder = new DocumentBuilder(noteId, noteIndex, references);
  for (let index = 0; index < blockCount; index += 1) {
    const random = createRandom((measuredIndex + 1) * 1_000_003 + index);
    builder.blocks.push(
      builder.block(`Block ${index + 1} in measured note ${measuredIndex + 1}`, index, random),
    );
  }
  return builder.result();
}

/**
 * @name ordinaryDocument
 * @description Builds the body of an unmeasured note, 5 to 10 blocks of the same varied
 * content, with a 40-line code block in every tenth note. Notes past the measured ones
 * mention a measured note's title in plain text, so unlinked-mention search finds them.
 * @example
 * const generated = ordinaryDocument("note-42", 42, references);
 */
export function ordinaryDocument(
  noteId: string,
  noteIndex: number,
  references: ContentReferences,
): GeneratedDocument {
  const builder = new DocumentBuilder(noteId, noteIndex, references);
  const blockCount = 5 + (noteIndex % 6);
  for (let index = 0; index < blockCount; index += 1) {
    const random = createRandom((noteIndex + 1) * 7_919 + index);
    const marker = `Section ${index + 1} of note ${noteIndex + 1}`;
    builder.blocks.push(
      index === 5 && noteIndex % 10 === 0
        ? builder.codeBlock(marker, 40)
        : builder.block(marker, index === 0 ? 2 : index, random),
    );
  }
  return builder.result();
}

/**
 * @name journalDocument
 * @description Builds a short journal entry: a heading, two rich paragraphs and a task list.
 * @example
 * const generated = journalDocument("journal-1", 1, references);
 */
export function journalDocument(
  noteId: string,
  entryIndex: number,
  references: ContentReferences,
): GeneratedDocument {
  const builder = new DocumentBuilder(noteId, entryIndex, references);
  const random = createRandom((entryIndex + 1) * 104_729);
  builder.blocks.push(
    builder.block(`Day ${entryIndex + 1}`, 1, random),
    builder.richParagraph(`Morning ${entryIndex + 1}`, entryIndex * 3, random),
    builder.checkList(`Plan ${entryIndex + 1}`, entryIndex, random),
    builder.richParagraph(`Evening ${entryIndex + 1}`, entryIndex * 3 + 1, random),
  );
  return builder.result();
}
