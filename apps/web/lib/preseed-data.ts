import type { Item, Note, Folder } from '@/features/notes/types'
import { getWelcomeContent } from './seed-content/welcome'

// ============================================================================
// Helpers
// ============================================================================

const now = Date.now()

function makeNote(
	id: string,
	name: string,
	content: any[],
	opts: Partial<Note> = {}
): Note {
	return {
		id,
		name,
		type: 'note',
		content,
		createdAt: now,
		updatedAt: now,
		pinned: false,
		favorite: false,
		tags: [],
		...opts
	}
}

function makeFolder(
	id: string,
	name: string,
	children: Item[],
	opts: Partial<Folder> = {}
): Folder {
	return {
		id,
		name,
		type: 'folder',
		children,
		createdAt: now,
		updatedAt: now,
		pinned: false,
		...opts
	}
}

// ============================================================================
// Block helpers (matching BlockNote format)
// ============================================================================

let _id = 0
const bid = (prefix: string) => `${prefix}-seed-${++_id}`

const heading = (level: 1 | 2 | 3, text: string) => ({
	id: bid('h'),
	type: 'heading' as const,
	props: { level, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
	content: [{ type: 'text' as const, text, styles: {} }],
	children: []
})

const para = (segments: Array<{ text: string; styles?: Record<string, boolean> }>) => ({
	id: bid('p'),
	type: 'paragraph' as const,
	props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
	content: segments.map((s) => ({ type: 'text' as const, text: s.text, styles: s.styles ?? {} })),
	children: []
})

const empty = () => para([{ text: '' }])

const bullet = (segments: Array<{ text: string; styles?: Record<string, boolean> }>) => ({
	id: bid('li'),
	type: 'bulletListItem' as const,
	props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
	content: segments.map((s) => ({ type: 'text' as const, text: s.text, styles: s.styles ?? {} })),
	children: []
})

// ============================================================================
// Seed content
// ============================================================================

function quickNotesContent(): any[] {
	return [
		para([{ text: 'A place for quick thoughts. Jot anything down here.' }]),
		empty(),
		bullet([{ text: 'Ideas that pop into your head' }]),
		bullet([{ text: 'Links you want to revisit' }]),
		bullet([{ text: 'Reminders for later' }]),
	]
}

function meetingNotesContent(): any[] {
	return [
		heading(2, 'Agenda'),
		bullet([{ text: 'Topic one' }]),
		bullet([{ text: 'Topic two' }]),
		empty(),
		heading(2, 'Notes'),
		para([{ text: 'Start typing here during your next meeting...' }]),
		empty(),
		heading(2, 'Action items'),
		para([{ text: 'List follow-ups here after the meeting.' }]),
	]
}

function projectIdeasContent(): any[] {
	return [
		para([
			{ text: 'Collect your project ideas here. Use ' },
			{ text: '/', styles: { code: true } },
			{ text: ' to add headings, checklists, or code blocks as you flesh them out.' },
		]),
		empty(),
		heading(2, 'Idea #1'),
		para([{ text: 'Describe it here...' }]),
		empty(),
		heading(2, 'Idea #2'),
		para([{ text: 'And another one...' }]),
	]
}

// ============================================================================
// Public API
// ============================================================================

export function generatePreseededItems(_userId: string): Item[] {
	_id = 0

	const welcomeNote = makeNote('welcome-getting-started', 'Getting started', getWelcomeContent())

	const scratchpad = makeNote('seed-scratchpad', 'Quick notes', quickNotesContent())

	const meetingNotes = makeNote('seed-meeting-notes', 'Meeting notes', meetingNotesContent(), {
		parentFolderId: 'seed-folder-work'
	})

	const projectIdeas = makeNote('seed-project-ideas', 'Project ideas', projectIdeasContent(), {
		parentFolderId: 'seed-folder-work'
	})

	const personalNote = makeNote('seed-personal', 'Reading list', [
		para([{ text: 'Books, articles, and things to read.' }]),
		empty(),
		bullet([{ text: 'Add your first item here...' }]),
	], {
		parentFolderId: 'seed-folder-personal'
	})

	const journalNote = makeNote('seed-journal', 'Journal', [
		heading(2, 'Today'),
		para([{ text: 'What happened today? What are you thinking about?' }]),
	], {
		parentFolderId: 'seed-folder-personal'
	})

	const workFolder = makeFolder('seed-folder-work', 'Work', [meetingNotes, projectIdeas])

	const personalFolder = makeFolder('seed-folder-personal', 'Personal', [
		personalNote,
		journalNote
	])

	return [welcomeNote, scratchpad, workFolder, personalFolder]
}

export function hasPreseededItems(): boolean {
	if (typeof window === 'undefined') return false
	return localStorage.getItem('zero_session:preseeded') === 'true'
}

export function markPreseededItems(): void {
	if (typeof window === 'undefined') return
	localStorage.setItem('zero_session:preseeded', 'true')
}

export function clearPreseededFlag(): void {
	if (typeof window === 'undefined') return
	localStorage.removeItem('zero_session:preseeded')
}
