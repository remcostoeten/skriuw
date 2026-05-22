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
  const markerNoteId = "sn-home";

  return {
    markerNoteId,
    folders: [
      {
        id: "sf-work",
        name: "Work",
        parentId: null,
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "sf-work-projects",
        name: "Projects",
        parentId: "sf-work",
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "sf-work-meetings",
        name: "Meetings",
        parentId: "sf-work",
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "sf-personal",
        name: "Personal",
        parentId: null,
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "sf-personal-ideas",
        name: "Ideas",
        parentId: "sf-personal",
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "sf-templates",
        name: "Templates",
        parentId: null,
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    ],
    notes: [
      {
        id: "sn-home",
        name: "Home.md",
        content:
          "# Home\n\nYour starting point. Everything links from here.\n\n## Now\n- Working on [[Website redesign]]\n- Notes from [[Kick-off meeting]] still need action items\n\n## Recently updated\n- [[Ideas]]\n- [[Daily note template]]",
        parentId: null,
        preferredEditorMode: "block",
        journalMeta: undefined,
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-07T09:00:00.000Z",
      },
      {
        id: "sn-redesign",
        name: "Website redesign.md",
        content:
          "# Website redesign\n\nStatus: in progress\n\n## Goal\nShip a cleaner homepage before end of month.\n\n## Open tasks\n- [ ] Review copy with the team\n- [ ] Finalise nav structure\n- [ ] Hand off to dev\n\n## Notes\nDecisions from [[Kick-off meeting]] apply here.\nRough ideas in [[Ideas]].",
        parentId: "sf-work-projects",
        preferredEditorMode: "block",
        journalMeta: undefined,
        createdAt: "2026-04-02T09:00:00.000Z",
        updatedAt: "2026-04-07T09:00:00.000Z",
      },
      {
        id: "sn-kickoff",
        name: "Kick-off meeting.md",
        content:
          "# Kick-off meeting\n\nDate: 2026-04-03\nAttendees: design, product, engineering\n\n## Decisions\n- Scope limited to homepage and nav\n- Launch target: end of April\n\n## Follow-ups\n- [ ] Share brief with design — owner: you\n- [ ] Book a review in two weeks\n\nRelated: [[Website redesign]]",
        parentId: "sf-work-meetings",
        preferredEditorMode: "block",
        journalMeta: undefined,
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z",
      },
      {
        id: "sn-ideas",
        name: "Ideas.md",
        content:
          "# Ideas\n\nLoose thoughts. Nothing needs to be good yet.\n\n- Simpler nav might help the homepage — mention in [[Website redesign]]\n- A weekly review template based on [[Daily note template]]\n- Backlinks as a sidebar panel",
        parentId: "sf-personal-ideas",
        preferredEditorMode: "block",
        journalMeta: undefined,
        createdAt: "2026-04-04T09:00:00.000Z",
        updatedAt: "2026-04-06T09:00:00.000Z",
      },
      {
        id: "sn-daily-template",
        name: "Daily note template.md",
        content:
          "# Daily note template\n\n## Top three\n- [ ] \n- [ ] \n- [ ] \n\n## Capture\n- \n\n## End of day\n- [ ] Clear inbox\n- [ ] Write one line for tomorrow",
        parentId: "sf-templates",
        preferredEditorMode: "block",
        journalMeta: undefined,
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    ],
    tags: [
      {
        id: "st-work",
        name: "work",
        color: "hsl(var(--project-blue))",
        usageCount: 3,
        lastUsedAt: "2026-04-07T09:00:00.000Z",
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-07T09:00:00.000Z",
      },
      {
        id: "st-ideas",
        name: "ideas",
        color: "hsl(var(--project-purple))",
        usageCount: 2,
        lastUsedAt: "2026-04-06T09:00:00.000Z",
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-04-06T09:00:00.000Z",
      },
    ],
    journalEntries: [
      {
        id: "sje-2026-04-03",
        dateKey: "2026-04-03",
        content:
          "Kick-off went well. Scope is tight which is good — less to argue about later.",
        mood: "good",
        tags: ["work"],
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z",
      },
      {
        id: "sje-2026-04-06",
        dateKey: "2026-04-06",
        content:
          "Added a few ideas to the ideas note. Nothing urgent, just didn't want to lose them.",
        mood: "neutral",
        tags: ["ideas"],
        createdAt: "2026-04-06T09:00:00.000Z",
        updatedAt: "2026-04-06T09:00:00.000Z",
      },
    ],
  };
}
