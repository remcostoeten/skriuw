/**
 * @fileoverview Preseed Data for All User Types
 * @description Provides default notes and folders for anonymous and authenticated users
 */

import type { Note, Folder, Item } from '@/features/notes/types'

const PRESEEDED_NOTES: Omit<
	Note,
	'id' | 'createdAt' | 'updatedAt' | 'parentFolderId'
>[] = [
	{
		name: 'Welcome to Skriuw',
		content: [
			{
				id: 'welcome-h1',
				type: 'heading',
				props: {
					level: 1,
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{ type: 'text', text: 'Welcome to Skriuw', styles: {} }
				],
				children: []
			},
			{
				id: 'welcome-p1',
				type: 'paragraph',
				props: {
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{
						type: 'text',
						text: 'A blazingly fast, privacy-focused note-taking app.',
						styles: {}
					}
				],
				children: []
			}
		],
		type: 'note',
		pinned: true,
		favorite: false
	},
	{
		name: 'Getting Started',
		content: [
			{
				id: 'gs-h1',
				type: 'heading',
				props: {
					level: 2,
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{ type: 'text', text: 'Getting Started', styles: {} }
				],
				children: []
			},
			{
				id: 'gs-p1',
				type: 'paragraph',
				props: {
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{
						type: 'text',
						text: 'Create notes and folders using sidebar or keyboard shortcuts.',
						styles: {}
					}
				],
				children: []
			},
			{
				id: 'gs-list',
				type: 'bulletListItem',
				props: {
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{
						type: 'text',
						text: 'Press Ctrl+N to create a new note',
						styles: {}
					}
				],
				children: []
			},
			{
				id: 'gs-list2',
				type: 'bulletListItem',
				props: {
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{
						type: 'text',
						text: 'Press Ctrl+F to create a new folder',
						styles: {}
					}
				],
				children: []
			},
			{
				id: 'gs-list3',
				type: 'bulletListItem',
				props: {
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{
						type: 'text',
						text: 'Press Ctrl+/ to view all shortcuts',
						styles: {}
					}
				],
				children: []
			}
		],
		type: 'note',
		pinned: false,
		favorite: false
	},
	{
		name: 'Save Your Work',
		content: [
			{
				id: 'save-h1',
				type: 'heading',
				props: {
					level: 2,
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [{ type: 'text', text: 'Save Your Work', styles: {} }],
				children: []
			},
			{
				id: 'save-p1',
				type: 'paragraph',
				props: {
					textColor: 'default',
					backgroundColor: 'default',
					textAlignment: 'left'
				},
				content: [
					{
						type: 'text',
						text: 'You can try the app and edit notes right now. To save your work permanently, sign in to create an account.',
						styles: {}
					}
				],
				children: []
			}
		],
		type: 'note',
		pinned: true,
		favorite: false
	}
]

const PRESEEDED_FOLDERS: Array<{
	name: string
	children?: string[]
	pinned?: boolean
}> = [
	{
		name: 'Personal',
		children: [],
		pinned: false
	},
	{
		name: 'Work',
		children: ['Project Ideas', 'Meeting Notes'],
		pinned: false
	},
	{
		name: 'Archive',
		children: [],
		pinned: false
	}
]

/**
 * Generates a stable/deterministic ID for preseeded items
 * This ensures the same ID is returned every time for the same name
 */
function stableId(prefix: string, name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
	return `${prefix}-preseed-${slug}`
}

export function generatePreseededItems(userId: string): Item[] {
	const now = Date.now()
	const items: Item[] = []

	const folderMap = new Map<string, string>()

	for (const folderData of PRESEEDED_FOLDERS) {
		const folderId = stableId('folder', folderData.name)
		folderMap.set(folderData.name, folderId)

		const folder: Folder = {
			id: folderId,
			name: folderData.name,
			type: 'folder',
			children: [],
			parentFolderId: undefined,
			pinned: folderData.pinned ?? false,
			createdAt: now,
			updatedAt: now
		}

		items.push(folder)
	}

	for (const noteData of PRESEEDED_NOTES) {
		const noteId = stableId('note', noteData.name)

		const note: Note = {
			id: noteId,
			name: noteData.name,
			type: 'note',
			content: noteData.content,
			parentFolderId: undefined,
			pinned: noteData.pinned ?? false,
			favorite: noteData.favorite ?? false,
			createdAt: now,
			updatedAt: now
		}

		items.push(note)
	}

	for (const folderData of PRESEEDED_FOLDERS) {
		if (folderData.children && folderData.children.length > 0) {
			const folderId = folderMap.get(folderData.name)
			if (!folderId) continue

			for (const childName of folderData.children) {
				const noteId = stableId('note', childName)

				const note: Note = {
					id: noteId,
					name: childName,
					type: 'note',
					content: [
						{
							id: `child-p-${noteId}`,
							type: 'paragraph',
							props: {
								textColor: 'default',
								backgroundColor: 'default',
								textAlignment: 'left'
							},
							content: [
								{
									type: 'text',
									text: `This is the ${childName} note.`,
									styles: {}
								}
							],
							children: []
						}
					],
					parentFolderId: folderId,
					pinned: false,
					favorite: false,
					createdAt: now + 1,
					updatedAt: now + 1
				}

				items.push(note)
			}
		}
	}

	return items
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
