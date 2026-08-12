import type { WorkspaceOperation } from "@/contracts/workspace";
import { documentTitleText, type IdFactory } from "@/store/actions/duplicate-note";
import { boundTitle } from "@/features/editor/note-title";
import { parseProductMarkdown, serializeProductMarkdown } from "@/features/editor/schema";
import {
  BUILT_IN_PROPERTY_TEMPLATES,
  instantiatePropertyTemplate,
} from "@/features/properties/templates";
import type { NotePropertyTemplate, PropertyIdFactory } from "@/features/properties/types";

export type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  /**
   * Built-in property template applied alongside the scaffold, so a meeting
   * note gets meeting fields without a second trip to the metadata panel.
   */
  propertyTemplateId: string | null;
  buildMarkdown: (at: number) => string;
};

function isoDate(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function longDate(at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(at));
}

function isoWeekStamp(at: number): string {
  const date = new Date(at);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((target.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const NOTE_TEMPLATES: readonly NoteTemplate[] = [
  {
    id: "blank",
    name: "Blank note",
    description: "An empty writing surface.",
    propertyTemplateId: null,
    buildMarkdown: () => "# Untitled\n\n",
  },
  {
    id: "daily",
    name: "Daily note",
    description: "A date-stamped log for today's focus, tasks and notes.",
    propertyTemplateId: null,
    buildMarkdown: (at) => `# ${longDate(at)}

## Focus

- ...

## Tasks

- [ ] ...

## Notes

`,
  },
  {
    id: "meeting",
    name: "Meeting notes",
    description: "Agenda, notes and action items, with meeting fields.",
    propertyTemplateId: "meeting",
    buildMarkdown: (at) => `# Meeting — ${isoDate(at)}

## Agenda

- ...

## Notes

## Action items

- [ ] ...
`,
  },
  {
    id: "project",
    name: "Project",
    description: "Overview, goals and tasks, with project fields.",
    propertyTemplateId: "project",
    buildMarkdown: () => `# Project

## Overview

## Goals

- ...

## Tasks

- [ ] ...

## Links

`,
  },
  {
    id: "todo",
    name: "To-do list",
    description: "A simple checklist to track tasks.",
    propertyTemplateId: null,
    buildMarkdown: () => `# To-do

- [ ] ...
- [ ] ...
- [ ] ...
`,
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    description: "Wins, blockers and next week's priorities.",
    propertyTemplateId: null,
    buildMarkdown: (at) => `# Weekly review — ${isoWeekStamp(at)}

## Wins

- ...

## Blockers

- ...

## Next week

- ...
`,
  },
  {
    id: "idea",
    name: "Idea",
    description: "Capture a pitch and next steps, with idea fields.",
    propertyTemplateId: "idea",
    buildMarkdown: () => `# Idea

## What

## Why now

## Next steps

- [ ] ...
`,
  },
  {
    id: "reading",
    name: "Reading notes",
    description: "Summary, highlights and takeaways, with reading fields.",
    propertyTemplateId: "reading",
    buildMarkdown: () => `# Reading notes

## Summary

## Highlights

- ...

## Takeaways

- ...
`,
  },
];

export function noteTemplate(id: string): NoteTemplate | null {
  return NOTE_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function templatePropertyTemplate(
  template: NoteTemplate,
): NotePropertyTemplate | null {
  if (template.propertyTemplateId === null) {
    return null;
  }
  return (
    BUILT_IN_PROPERTY_TEMPLATES.find(
      (entry) => entry.id === template.propertyTemplateId,
    ) ?? null
  );
}

export function filterNoteTemplates(
  templates: readonly NoteTemplate[],
  query: string,
): NoteTemplate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...templates];
  }
  return templates.filter(
    (template) =>
      template.name.toLowerCase().includes(needle) ||
      template.description.toLowerCase().includes(needle),
  );
}

export type NoteTemplatePlan = {
  noteId: string;
  title: string;
  operations: readonly WorkspaceOperation[];
};

/**
 * The operations that create a note from `template` inside `parentId`. Pure so
 * the scaffold and property composition stay unit-testable; `createId`
 * supplies every fresh id. The Markdown is parsed here — on the user-initiated
 * create action — and re-serialized so the stored pair is canonical.
 */
export function planTemplateNote(
  template: NoteTemplate,
  parentId: string | null,
  at: number,
  createId: IdFactory,
): NoteTemplatePlan {
  const document = parseProductMarkdown(template.buildMarkdown(at));
  const documentJson = document.toJSON();
  const markdown = serializeProductMarkdown(document);
  const noteId = createId();
  const headingText = documentTitleText(documentJson);
  const title = boundTitle(headingText.length > 0 ? headingText : template.name);
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id: noteId,
      title,
      placement: { parentId, position: { type: "last" } },
      documentJson,
      markdown,
      at,
    },
  ];
  const propertyTemplate = templatePropertyTemplate(template);
  if (propertyTemplate) {
    const createPropertyId: PropertyIdFactory = (kind) => `${kind}_${createId()}`;
    for (const property of instantiatePropertyTemplate(
      propertyTemplate,
      noteId,
      createPropertyId,
    )) {
      operations.push({ type: "set_note_property", property, at });
    }
  }
  operations.push({ type: "set_active_note", noteId });
  return { noteId, title, operations };
}
