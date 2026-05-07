import type { MoodLevel } from "@/types/journal";

type StarterJournalMetadata = {
  mood?: MoodLevel;
  tags: string[];
  weather?: string;
  location?: string;
};

type StarterFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

type StarterNote = {
  id: string;
  name: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  preferredEditorMode?: "raw" | "block";
  journalMeta?: StarterJournalMetadata;
};

type StarterTag = {
  id: string;
  name: string;
  color: string;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StarterJournalEntry = {
  id: string;
  dateKey: string;
  content: string;
  mood?: MoodLevel;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type StarterContent = {
  folders: StarterFolder[];
  notes: StarterNote[];
  tags: StarterTag[];
  journalEntries: StarterJournalEntry[];
  markerNoteId: string;
};

export type MobileStarterWorkspace = {
  folders: StarterFolder[];
  notes: Array<Omit<StarterNote, "preferredEditorMode" | "journalMeta">>;
  journalEntries: StarterJournalEntry[];
};

function iso(day: string) {
  return `${day}T09:00:00.000Z`;
}

export function buildWebStarterContent(): StarterContent {
  const markerNoteId = "starter-note-field-guide";

  return {
    markerNoteId,
    folders: [
      {
        id: "starter-folder-studio",
        name: "Product Studio",
        parentId: null,
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-08"),
      },
      {
        id: "starter-folder-research",
        name: "Research",
        parentId: "starter-folder-studio",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-09"),
      },
      {
        id: "starter-folder-playground",
        name: "Playground",
        parentId: null,
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-08"),
      },
      {
        id: "starter-folder-experiments",
        name: "Experiments Lab",
        parentId: "starter-folder-playground",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-09"),
      },
      {
        id: "starter-folder-recipes",
        name: "Recipes",
        parentId: "starter-folder-playground",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-09"),
      },
      {
        id: "starter-folder-templates",
        name: "Templates",
        parentId: null,
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
    ],
    notes: [
      {
        id: markerNoteId,
        name: "Start here - editor field guide.md",
        content: `# Start here: editor field guide

This is not a brochure. It is a note you can edit, fold, break, rename, link, and turn into something useful in about **ninety seconds**. The starter workspace is intentionally full enough to feel like a real place.

## Try the surface

- Type \`/\` on a blank line to add headings, lists, code blocks, and more.
- Type \`[[\` to connect notes. This one is meant to link nicely with [[Idea board]] and [[Research brief - local-first notes]].
- Drag blocks by the handle, or just write like normal markdown and let the editor keep up.
- Open the metadata panel and move this note between folders.

> Good notes are less like filing cabinets and more like workbenches: a little messy, but everything important is within reach.

## Starter checklist

- [ ] Rename this note to something less polite
- [ ] Open Product Studio, Playground, and Templates in the sidebar
- [ ] Edit an MDX example and add your own component idea
- [ ] Search for "decision", "callout", or "schema" from the sidebar
- [x] Delete anything that feels too demo-ish

## A quick map

\`\`\`text
Skriuw starter workspace
|-- Start here - editor field guide.md
|-- Product Studio/
|   |-- Launch review - sync v2.md
|   \`-- Research/
|       \`-- Research brief - local-first notes.md
|-- Playground/
|   |-- Idea board.md
|   |-- Experiments Lab/
|   |   |-- MDX: Component gallery.mdx
|   |   \`-- Prompt snippets for rewriting.md
|   \`-- Recipes/
|       \`-- MDX: Space Pancakes.mdx
\`-- Templates/
    |-- Daily note template.md
    \`-- Meeting notes template.md
\`\`\`

Skriuw starts small on purpose. Keep the useful bits, remove the rest, and make the sidebar yours.
`,
        parentId: null,
        preferredEditorMode: "block",
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-note-launch-review",
        name: "Launch review - sync v2.md",
        content: `# Launch review: sync v2

## Snapshot

The account-backed workspace now seeds with notes, folders, journal entries, and tags. The remaining risk is not correctness alone; it is whether a new user immediately understands what the editor can do.

## Decisions

| Topic | Decision | Owner |
| --- | --- | --- |
| Starter data | Seed richer example notes after authentication | Product |
| Editor modes | Show both block notes and raw MDX | Engineering |
| Mobile | Keep copies concise but useful | Design |

## Action items

- [x] Replace empty-feeling demo files
- [x] Include nested folders so the sidebar has shape
- [ ] Add one product screenshot after the visual pass
- [ ] Revisit first-run copy once real users delete the samples

## Notes from the room

> The workspace should teach by being editable, not by explaining itself from outside the editor.

Related: [[Start here: editor field guide]], [[Meeting notes template]]
`,
        parentId: "starter-folder-studio",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-note-research-local-first",
        name: "Research brief - local-first notes.md",
        content: `# Research brief: local-first notes

## Question

How should Skriuw feel when a user moves between quick capture, structured writing, and a synced cloud workspace?

## Evidence board

- Notes are not always documents. Sometimes they are checklists, logs, snippets, drafts, meeting records, and throwaway scratch.
- Folder hierarchy is useful when it reflects a project, not when it tries to classify every thought.
- Raw markdown matters for people who want precise control. Rich blocks matter for people who want the page to stay calm.

## Working model

1. Capture should be fast enough that organization can wait.
2. Search and links should recover meaning when folders are imperfect.
3. The editor should preserve intent: code stays code, lists stay lists, MDX stays editable.

## Open questions

- Should backlinks become a first-class panel?
- Should templates create notes in the current folder?
- Can journal entries be promoted into regular notes without losing metadata?

Related trails: [[Idea board]], [[Prompt snippets for rewriting]]
`,
        parentId: "starter-folder-research",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-note-idea-board",
        name: "Idea board.md",
        content: `# Idea board

Use this as a scratchpad for anything that wants to become real later.

## Today

- [ ] Turn one sentence into a note
- [ ] Link it to another note with [[Start here: editor field guide]]
- [ ] Pin only what you actually want to see tomorrow

## Small bets

1. Collect raw material without judging it too early.
2. Group related fragments in folders when hierarchy helps.
3. Use links when a thought belongs in more than one place.

## Parking lot

- A command palette action that turns selected bullets into a new note.
- A daily shutdown template that collects open loops.
- A note health view that finds lonely pages with no links.

## A tiny scriptable ritual

\`\`\`ts
const ritual = [
  "capture the weird thought",
  "name it before it evaporates",
  "link it to one useful neighbor",
];

console.log(ritual.join(" -> "));
\`\`\`
`,
        parentId: "starter-folder-playground",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-note-prompt-snippets",
        name: "Prompt snippets for rewriting.md",
        content: `# Prompt snippets for rewriting

This note is intentionally half-library, half-scratchpad. It shows code fences, nested lists, and copy you might reuse.

## Tighten a messy paragraph

\`\`\`text
Rewrite the selected paragraph so it is shorter, more concrete, and less promotional.
Keep product names and technical claims unchanged.
Return only the rewritten paragraph.
\`\`\`

## Turn bullets into a decision log

- Input: raw meeting bullets
- Output:
  1. Decision
  2. Reason
  3. Follow-up owner
  4. Deadline

## Diff-friendly release note

\`\`\`md
### Changed
- Replaced placeholder starter notes with richer workspace examples.
- Added MDX, code, checklists, tables, and templates to the authenticated seed.

### Verify
- Sign in with a new account.
- Confirm folders, notes, tags, and journal entries appear.
\`\`\`
`,
        parentId: "starter-folder-experiments",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-12"),
        updatedAt: iso("2026-04-12"),
      },
      {
        id: "starter-note-mdx-component-gallery",
        name: "MDX: Component gallery.mdx",
        content: `---
title: Component Gallery
status: sketching
tags: [mdx, experiments, components]
---

import { Callout, Metric, Timeline } from "@/components/skriuw";

# Component Gallery

<Callout tone="info" title="MDX stays editable">
  This file is raw on purpose. Use it to test frontmatter, imports, JSX blocks, and regular markdown in one note.
</Callout>

<Metric label="Notes seeded" value="9" delta="+6" />

## Launch timeline

<Timeline
  items={[
    { date: "Apr 7", title: "Auth gate ready" },
    { date: "Apr 10", title: "Starter workspace gets real folders" },
    { date: "Apr 13", title: "Demo notes show editor range" },
  ]}
/>

## Plain markdown still works

- Keep prose readable before components render.
- Use \`[[Launch review - sync v2]]\` to connect structured examples.
- Drop into code whenever the note needs precision.

\`\`\`tsx
export function TinyBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded border px-2 py-1">{children}</span>;
}
\`\`\`
`,
        parentId: "starter-folder-experiments",
        preferredEditorMode: "raw",
        journalMeta: {
          mood: "great",
          tags: ["experiments"],
          location: "Amsterdam",
        },
        createdAt: iso("2026-04-12"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-note-mdx-space-pancakes",
        name: "MDX: Space Pancakes.mdx",
        content: `---
title: Space Pancakes
status: edible
serves: 2 astronauts and one impatient designer
tags: [breakfast, mdx, experiments]
---

import { Callout, Rating } from "@/components/kitchen";

# Space Pancakes

<Callout tone="warning">
  Do not flip pancakes during launch. Syrup has poor orbital discipline.
</Callout>

Whisk:

- 1 cup flour
- 1 cup milk
- 1 egg
- a suspicious amount of vanilla

<Rating value={4.8} label="Mission breakfast score" />

Serve with berries, coffee, and a note called [[Idea board]].

## Why this is here

- Code blocks keep indentation and language labels.
- Markdown-ish writing stays readable before it becomes polished.
- Links like \`[[Idea board]]\` can turn throwaway references into a useful trail.
`,
        parentId: "starter-folder-recipes",
        preferredEditorMode: "raw",
        journalMeta: {
          mood: "good",
          tags: ["writing"],
          location: "Amsterdam",
        },
        createdAt: iso("2026-04-11"),
        updatedAt: iso("2026-04-11"),
      },
      {
        id: "starter-note-daily-template",
        name: "Daily note template.md",
        content: `# Daily note template

## Intent

One sentence for what would make today count:

## Top three

- [ ] Pick the first priority
- [ ] Pick the second priority
- [ ] Pick the third priority

## Capture

- Add loose thoughts here

## Review

| Signal | Note |
| --- | --- |
| Energy |  |
| Focus |  |
| One thing to carry forward |  |

## Shutdown

- [ ] File loose notes
- [ ] Move unfinished tasks
- [ ] Write one line for tomorrow
`,
        parentId: "starter-folder-templates",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
      {
        id: "starter-note-meeting-template",
        name: "Meeting notes template.md",
        content: `# Meeting notes template

## Context

- Date:
- People:
- Goal:

## Agenda

1. First topic
2. Second topic
3. Third topic

## Decisions

| Decision | Why | Owner |
| --- | --- | --- |
|  |  |  |

## Follow-ups

- [ ] Add an owner and date

## Links

- [[Launch review - sync v2]]
`,
        parentId: "starter-folder-templates",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
    ],
    tags: [
      {
        id: "starter-tag-writing",
        name: "writing",
        color: "#3b82f6",
        usageCount: 5,
        lastUsedAt: iso("2026-04-13"),
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-tag-experiments",
        name: "experiments",
        color: "#f97316",
        usageCount: 4,
        lastUsedAt: iso("2026-04-13"),
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-tag-product",
        name: "product",
        color: "#10b981",
        usageCount: 2,
        lastUsedAt: iso("2026-04-13"),
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "starter-tag-templates",
        name: "templates",
        color: "#8b5cf6",
        usageCount: 2,
        lastUsedAt: iso("2026-04-10"),
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
    ],
    journalEntries: [
      {
        id: "starter-entry-2026-04-12",
        dateKey: "2026-04-12",
        content: `Opened the starter workspace and found the space pancake recipe.

The important test: the editor should feel playful before it asks me to be organized.`,
        mood: "great",
        tags: ["writing", "experiments"],
        createdAt: iso("2026-04-12"),
        updatedAt: iso("2026-04-12"),
      },
      {
        id: "starter-entry-2026-04-13",
        dateKey: "2026-04-13",
        content: `Added a richer starter workspace with project notes, research notes, templates, and raw MDX.

The useful question: does the first authenticated screen now feel like a working notebook instead of a placeholder?`,
        mood: "good",
        tags: ["product", "writing"],
        createdAt: iso("2026-04-13"),
        updatedAt: iso("2026-04-13"),
      },
    ],
  };
}

export function buildMobileStarterWorkspace(): MobileStarterWorkspace {
  return {
    folders: [
      {
        id: "mobile-folder-studio",
        name: "Product Studio",
        parentId: null,
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-08"),
      },
      {
        id: "mobile-folder-research",
        name: "Research",
        parentId: "mobile-folder-studio",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-09"),
      },
      {
        id: "mobile-folder-playground",
        name: "Playground",
        parentId: null,
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-08"),
      },
      {
        id: "mobile-folder-experiments",
        name: "Experiments Lab",
        parentId: "mobile-folder-playground",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-09"),
      },
      {
        id: "mobile-folder-recipes",
        name: "Recipes",
        parentId: "mobile-folder-playground",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-09"),
      },
      {
        id: "mobile-folder-templates",
        name: "Templates",
        parentId: null,
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
    ],
    notes: [
      {
        id: "mobile-note-field-guide",
        name: "Start here - mobile field guide.md",
        content: `# Start here: mobile field guide

This is a real note, not a static welcome screen.

- Capture a thought while it is still warm.
- File it under Playground if it is not serious yet.
- Move it later when it earns a better home.
- Search for "decision", "MDX", or "template" to see the starter range.

\`\`\`text
Product Studio/
|-- Launch review - sync v2.md
Playground/
|-- Idea board.md
|-- Experiments Lab/
|   \`-- Prompt snippets for rewriting.md
\`-- Recipes/
    \`-- MDX: Space Pancakes.mdx
\`\`\`
`,
        parentId: null,
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "mobile-note-launch-review",
        name: "Launch review - sync v2.md",
        content: `# Launch review: sync v2

## Decisions

- Seed richer examples after authentication.
- Show both structured notes and raw MDX.
- Keep mobile notes shorter, but still real.

## Follow-ups

- [x] Add fuller folders
- [x] Add reusable templates
- [ ] Review the first-run mobile list after sign-in
`,
        parentId: "mobile-folder-studio",
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "mobile-note-research-local-first",
        name: "Research brief - local-first notes.md",
        content: `# Research brief: local-first notes

- Capture should be fast enough that organization can wait.
- Search and links should recover meaning when folders are imperfect.
- The editor should preserve intent across prose, lists, code, and MDX.
`,
        parentId: "mobile-folder-research",
        createdAt: iso("2026-04-09"),
        updatedAt: iso("2026-04-13"),
      },
      {
        id: "mobile-note-idea-board",
        name: "Idea board.md",
        content: `# Idea board

- One small note beats one perfect system.
- Link related thoughts before they drift.
- Keep folders useful, not ceremonial.
- Try one note that is just a checklist.
`,
        parentId: "mobile-folder-playground",
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
      {
        id: "mobile-note-prompt-snippets",
        name: "Prompt snippets for rewriting.md",
        content: `# Prompt snippets for rewriting

\`\`\`text
Rewrite the selected paragraph so it is shorter, more concrete, and less promotional.
Keep product names and technical claims unchanged.
\`\`\`

- Turn raw meeting bullets into decisions.
- Turn a rough idea into an outline.
- Turn a release note into a checklist.
`,
        parentId: "mobile-folder-experiments",
        createdAt: iso("2026-04-12"),
        updatedAt: iso("2026-04-12"),
      },
      {
        id: "mobile-note-mdx-space-pancakes",
        name: "MDX: Space Pancakes.mdx",
        content: `# MDX: Space Pancakes

Use this as a compact mobile copy of the web MDX demo.

\`\`\`mdx
<Callout tone="warning">
  Syrup has poor orbital discipline.
</Callout>

<Rating value={4.8} label="Mission breakfast score" />
\`\`\`
`,
        parentId: "mobile-folder-recipes",
        createdAt: iso("2026-04-11"),
        updatedAt: iso("2026-04-11"),
      },
      {
        id: "mobile-note-daily-template",
        name: "Daily note template.md",
        content: `# Daily note template

## Top three

- [ ] Pick the first priority
- [ ] Pick the second priority
- [ ] Pick the third priority

## Capture

- Add loose thoughts here

## Shutdown

- [ ] File loose notes
- [ ] Move unfinished tasks
- [ ] Write one line for tomorrow
`,
        parentId: "mobile-folder-templates",
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
    ],
    journalEntries: [
      {
        id: "mobile-entry-2026-04-12",
        dateKey: "2026-04-12",
        content: `Signed in on mobile and found the starter notes already waiting.

The best onboarding is a workspace that is useful enough to edit immediately.`,
        mood: "great",
        tags: ["mobile", "writing"],
        createdAt: iso("2026-04-12"),
        updatedAt: iso("2026-04-12"),
      },
      {
        id: "mobile-entry-2026-04-13",
        dateKey: "2026-04-13",
        content: `Next: turn one throwaway idea into a linked note and see where it wants to live.

The starter workspace finally has enough texture to browse instead of ignore.`,
        mood: "good",
        tags: ["experiments"],
        createdAt: iso("2026-04-13"),
        updatedAt: iso("2026-04-13"),
      },
    ],
  };
}
