import type { Block } from "@blocknote/core";
import { generateId } from "@skriuw/shared";

export type NoteTemplate = 'empty' | 'h1' | 'h2' | 'meeting' | 'journal' | 'project'

/**
 * Get initial content for a new note based on the default note template setting
 * @param template - The template type
 * @returns Array of initial blocks
 */
export function getInitialNoteContent(template: NoteTemplate = 'empty'): Block[] {
	switch (template) {
		case 'empty':
			return [createParagraph()]

		case 'h1':
			return [createHeading(1)]

		case 'h2':
			return [createHeading(2)]

		case 'meeting':
			return getMeetingTemplate()

		case 'journal':
			return getJournalTemplate()

		case 'project':
			return getProjectTemplate()

		default:
			return [createParagraph()]
	}
}

function createParagraph(text: string = ''): Block {
	return {
		id: generateId(),
		type: 'paragraph',
		props: {
			backgroundColor: 'default',
			textColor: 'default',
			textAlignment: 'left'
		},
		content: text ? [{ type: 'text', text, styles: {} }] : [],
		children: []
	} as Block
}

function createHeading(level: 1 | 2 | 3, text: string = ''): Block {
	return {
		id: generateId(),
		type: 'heading',
		props: {
			level,
			backgroundColor: 'default',
			textColor: 'default',
			textAlignment: 'left'
		},
		content: text ? [{ type: 'text', text, styles: {} }] : [],
		children: []
	} as Block
}

function createBulletItem(text: string): Block {
	return {
		id: generateId(),
		type: 'bulletListItem',
		props: {
			backgroundColor: 'default',
			textColor: 'default',
			textAlignment: 'left'
		},
		content: [{ type: 'text', text, styles: {} }],
		children: []
	} as Block
}

function createChecklistItem(text: string, checked: boolean = false): Block {
	return {
		id: generateId(),
		type: 'checkListItem',
		props: {
			backgroundColor: 'default',
			textColor: 'default',
			textAlignment: 'left',
			checked
		},
		content: [{ type: 'text', text, styles: {} }],
		children: []
	} as Block
}

/**
 * Meeting notes template - structured for capturing meeting information
 */
function getMeetingTemplate(): Block[] {
	return [
		createHeading(2, 'Attendees'),
		createBulletItem(''),
		createParagraph(),
		createHeading(2, 'Agenda'),
		createBulletItem(''),
		createParagraph(),
		createHeading(2, 'Notes'),
		createParagraph(),
		createParagraph(),
		createHeading(2, 'Action Items'),
		createChecklistItem(''),
	]
}

/**
 * Journal/daily note template - structured for daily reflection
 */
function getJournalTemplate(): Block[] {
	return [
		createHeading(3, 'Today\'s Focus'),
		createParagraph(),
		createParagraph(),
		createHeading(3, 'Tasks'),
		createChecklistItem(''),
		createParagraph(),
		createHeading(3, 'Notes'),
		createParagraph(),
	]
}

/**
 * Project template - structured for project planning
 */
function getProjectTemplate(): Block[] {
	return [
		createHeading(2, 'Overview'),
		createParagraph(),
		createParagraph(),
		createHeading(2, 'Goals'),
		createBulletItem(''),
		createParagraph(),
		createHeading(2, 'Tasks'),
		createChecklistItem(''),
		createParagraph(),
		createHeading(2, 'Resources'),
		createBulletItem(''),
		createParagraph(),
		createHeading(2, 'Notes'),
		createParagraph(),
	]
}
