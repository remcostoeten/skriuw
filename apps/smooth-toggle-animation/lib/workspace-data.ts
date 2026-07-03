// Mock workspace content shared by sidebar search and the command palette.

export type WorkspaceNote = {
  id: string
  name: string
  folder?: string
  lines: string[]
}

export const WORKSPACE_NOTES: WorkspaceNote[] = [
  {
    id: "welcome",
    name: "Welcome to Skriuw.md",
    lines: [
      "Skriuw is a notes workspace that stays out of your way — scratchpad, journal, or linked knowledge base.",
      "This note is tagged #getting-started. The companion note Skriuw handbook goes deeper.",
      "Press I and open the inspector on this note.",
      "Click Skriuw handbook below, then check Outgoing links and Backlinks.",
      "Type / on a blank line to insert blocks.",
      "Each paragraph is a block. Hover the handle to reorder.",
      "Type markdown inline — ## becomes a heading, [ ] becomes a checkbox.",
      "Insert a file tree block with /file tree — see Skriuw handbook for a live example.",
      "Type [[ Note title ]] to link another note. Unresolved links can be clicked to create the target note.",
      "Add tags inline with #tag or the /tag slash command.",
      "N new note · Cmd/Ctrl K command palette · Cmd/Ctrl \\ toggle sidebar",
    ],
  },
  {
    id: "handbook",
    name: "Skriuw handbook",
    lines: [
      "The handbook is the long-form companion to the welcome note.",
      "Folders keep related notes together. Drag a note onto a folder to move it.",
      "Backlinks show every note that references the current one.",
      "The file tree block renders a live view of any folder inside a note.",
      "Use the journal calendar to keep daily notes — one entry per day.",
    ],
  },
  {
    id: "planning",
    name: "Planning issues",
    folder: "Planning issues",
    lines: [
      "Track open questions before the next release.",
      "Issue: search should match across all notes, not just the open one.",
      "Issue: command palette needs recent files at the top.",
    ],
  },
  {
    id: "gekke",
    name: "Gekke boy.md",
    lines: ["A quick scratch note.", "Remember to link this note to the handbook later."],
  },
  {
    id: "new-note",
    name: "this is a new note.md",
    lines: ["Fresh note created from the sidebar.", "Notes can hold tasks, tags, and links."],
  },
  {
    id: "lollygat",
    name: "lollygat.md",
    lines: ["Loose ideas live here.", "Search across the workspace finds this line too."],
  },
]
