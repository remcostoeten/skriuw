import { shiftDay, todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import {
  bullets,
  checks,
  code,
  heading,
  paragraph,
  quote,
  type Block,
  type Chip,
} from "./document";

export const ROOT_ID = "dev-seed-root";
export const PROJECTS_ID = "dev-seed-projects";
export const RESEARCH_ID = "dev-seed-research";
export const ARCHIVE_ID = "dev-seed-archive";

const HUB = "dev-seed-note-editor";

export const TAGS = [
  { id: "dev-seed-tag-roadmap", name: "roadmap" },
  { id: "dev-seed-tag-design", name: "design" },
  { id: "dev-seed-tag-research", name: "research" },
  { id: "dev-seed-tag-sync", name: "sync" },
  { id: "dev-seed-tag-writing", name: "writing" },
];

export const PEOPLE = [
  { id: "dev-seed-person-ada", name: "Ada Lovelace" },
  { id: "dev-seed-person-grace", name: "Grace Hopper" },
  { id: "dev-seed-person-alan", name: "Alan Turing" },
  { id: "dev-seed-person-barbara", name: "Barbara Liskov" },
];

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

export type SeedNote = {
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

export const NOTES: SeedNote[] = [
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
      code("json", '{ "protocolVersion": 4, "chunked": true, "ceiling": 65536 }'),
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
      paragraph(
        "Agenda item: ",
        note(HUB, "Editor rewrite"),
        ". Notes by ",
        person("Barbara"),
        ".",
      ),
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
      paragraph(
        "Gate for the next tag. Depends on ",
        note("dev-seed-note-sync", "Sync protocol"),
        ".",
      ),
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
      paragraph(
        "Survey of editors that survived a schema migration. Tagged ",
        tag("research"),
        ".",
      ),
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
      bullets(["Operation, not mutation"], ["Projection, not cache"], ["Candidate, not neighbour"]),
      paragraph("Tagged ", tag("writing"), " with ", person("Grace"), "."),
    ],
  },
  {
    id: "dev-seed-note-glossary",
    parentId: RESEARCH_ID,
    title: "Glossary",
    body: [
      paragraph("Terms that keep drifting. Tagged ", tag("writing"), " and ", tag("research"), "."),
      bullets(["Detached task: a record whose source link disappeared, per ADR 0031"]),
    ],
  },
  ...archiveNotes(),
];

export type JournalSeed = {
  id: string;
  dateKey: DateKey;
  body: Block[];
};

export function journalSeeds(): JournalSeed[] {
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
        bullets(["The chip parser is the last blocker before the cut, tagged ", tag("roadmap")]),
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
        paragraph(
          "Quiet day. Sketched the rail with ",
          person("Grace"),
          " under ",
          tag("design"),
          ".",
        ),
      ],
    },
  ];
}
