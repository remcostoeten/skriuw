import { format } from "date-fns";

export type NoteTemplateBody = {
	name: string;
	content: string;
};

export type NoteTemplate = {
	id: string;
	name: string;
	description: string;
	build: () => NoteTemplateBody;
};

function today(): Date {
	return new Date();
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
	{
		id: "blank",
		name: "Blank note",
		description: "An empty note with the default starter hints.",
		build: () => ({
			name: "Untitled.md",
			content: `# Untitled

#draft #idea

Start writing here. Use # for tags, @ to mention notes, or /tag and /link note from the block editor.
`,
		}),
	},
	{
		id: "daily",
		name: "Daily note",
		description: "A date-stamped note for today's log, tasks and notes.",
		build: () => {
			const now = today();
			const stamp = format(now, "yyyy-MM-dd");
			const heading = format(now, "EEEE, MMMM d, yyyy");
			return {
				name: `${stamp}.md`,
				content: `# ${heading}

#daily

## Focus

-

## Tasks

- [ ]

## Notes

`,
			};
		},
	},
	{
		id: "meeting",
		name: "Meeting notes",
		description: "Attendees, agenda, notes and action items.",
		build: () => {
			const stamp = format(today(), "yyyy-MM-dd");
			return {
				name: `Meeting ${stamp}.md`,
				content: `# Meeting

#meeting

**Date:** ${stamp}
**Attendees:**

## Agenda

-

## Notes

## Action items

- [ ]
`,
			};
		},
	},
	{
		id: "todo",
		name: "To-do list",
		description: "A simple checklist to track tasks.",
		build: () => ({
			name: "To-do.md",
			content: `# To-do

#todo

- [ ]
- [ ]
- [ ]
`,
		}),
	},
	{
		id: "weekly-review",
		name: "Weekly review",
		description: "Reflect on wins, blockers and next week's priorities.",
		build: () => {
			const stamp = format(today(), "yyyy-'W'II");
			return {
				name: `Weekly review ${stamp}.md`,
				content: `# Weekly review — ${stamp}

#review

## Wins

-

## Blockers

-

## Next week

-
`,
			};
		},
	},
];

export function getNoteTemplate(id: string): NoteTemplate | undefined {
	return NOTE_TEMPLATES.find((template) => template.id === id);
}
