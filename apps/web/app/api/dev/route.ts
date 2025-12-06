import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, notes, folders, tasks, settings, shortcuts, getSafeTimestamp } from '@skriuw/db'

function isDev() {
	return process.env.NODE_ENV === 'development'
}

const sampleNotes = [
	{
		name: 'Welcome to Skriuw',
		content: [
			{
				id: 'welcome-h1',
				type: 'heading',
				props: { level: 1 },
				content: [{ type: 'text', text: 'Welcome to Skriuw', styles: {} }],
				children: [],
			},
			{
				id: 'welcome-p1',
				type: 'paragraph',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
				content: [{ type: 'text', text: 'A blazingly fast, privacy-focused note-taking app.', styles: {} }],
				children: [],
			},
		],
		pinned: true,
	},
	{
		name: 'Getting Started',
		content: [
			{
				id: 'gs-h1',
				type: 'heading',
				props: { level: 2 },
				content: [{ type: 'text', text: 'Getting Started', styles: {} }],
				children: [],
			},
			{
				id: 'gs-p1',
				type: 'paragraph',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
				content: [{ type: 'text', text: 'Create notes and folders using the sidebar or keyboard shortcuts.', styles: {} }],
				children: [],
			},
			{
				id: 'gs-list',
				type: 'bulletListItem',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
				content: [{ type: 'text', text: 'Press Ctrl+N to create a new note', styles: {} }],
				children: [],
			},
			{
				id: 'gs-list2',
				type: 'bulletListItem',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
				content: [{ type: 'text', text: 'Press Ctrl+F to create a new folder', styles: {} }],
				children: [],
			},
			{
				id: 'gs-list3',
				type: 'bulletListItem',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
				content: [{ type: 'text', text: 'Press Ctrl+/ to view all shortcuts', styles: {} }],
				children: [],
			},
		],
	},
	{
		name: 'Sample Note with Tasks',
		content: [
			{
				id: 'task-h1',
				type: 'heading',
				props: { level: 2 },
				content: [{ type: 'text', text: 'My Todo List', styles: {} }],
				children: [],
			},
			{
				id: 'task-cb1',
				type: 'checkListItem',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: false },
				content: [{ type: 'text', text: 'Learn keyboard shortcuts', styles: {} }],
				children: [],
			},
			{
				id: 'task-cb2',
				type: 'checkListItem',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: true },
				content: [{ type: 'text', text: 'Create first note', styles: {} }],
				children: [],
			},
			{
				id: 'task-cb3',
				type: 'checkListItem',
				props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: false },
				content: [{ type: 'text', text: 'Organize notes into folders', styles: {} }],
				children: [],
			},
		],
	},
]

const sampleFolders = [
	{ name: 'Projects', children: ['Project Alpha', 'Project Beta'] },
	{ name: 'Personal' },
	{ name: 'Archive' },
]

function generateId(prefix: 'note' | 'folder') {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// POST /api/dev - Execute dev actions
export async function POST(request: NextRequest) {
	if (!isDev()) {
		return NextResponse.json(
			{ error: 'Dev endpoints are only available in development mode' },
			{ status: 403 }
		)
	}

	try {
		const db = getDatabase()
		const body = await request.json()
		const action = body.action as string

		switch (action) {
			case 'seed': {
				const now = getSafeTimestamp()
				const createdItems: { notes: number; folders: number } = { notes: 0, folders: 0 }

				// Create folders first
				for (const folderData of sampleFolders) {
					const folderId = generateId('folder')
					await db.insert(folders).values({
						id: folderId,
						name: folderData.name,
						parentFolderId: null,
						pinned: 0,
						pinnedAt: null,
						createdAt: now,
						updatedAt: now,
						type: 'folder',
					})
					createdItems.folders++

					// Create child notes if specified
					if (folderData.children) {
						for (const childName of folderData.children) {
							await db.insert(notes).values({
								id: generateId('note'),
								name: childName,
								content: JSON.stringify([
									{
										id: `p-${Date.now()}`,
										type: 'paragraph',
										props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
										content: [{ type: 'text', text: `This is the ${childName} note.`, styles: {} }],
										children: [],
									},
								]),
								parentFolderId: folderId,
								pinned: 0,
								pinnedAt: null,
								favorite: 0,
								createdAt: now + createdItems.notes,
								updatedAt: now + createdItems.notes,
								type: 'note',
							})
							createdItems.notes++
						}
					}
				}

				// Create root-level sample notes
				for (const noteData of sampleNotes) {
					await db.insert(notes).values({
						id: generateId('note'),
						name: noteData.name,
						content: JSON.stringify(noteData.content),
						parentFolderId: null,
						pinned: noteData.pinned ? 1 : 0,
						pinnedAt: noteData.pinned ? now : null,
						favorite: 0,
						createdAt: now + createdItems.notes,
						updatedAt: now + createdItems.notes,
						type: 'note',
					})
					createdItems.notes++
				}

				return NextResponse.json({
					success: true,
					action: 'seed',
					created: createdItems,
					message: `Created ${createdItems.notes} notes and ${createdItems.folders} folders`,
				})
			}

			case 'clear-notes': {
				// Delete all tasks first (foreign key constraint)
				await db.delete(tasks)
				// Delete all notes
				const deletedNotes = await db.delete(notes).returning()
				// Delete all folders
				const deletedFolders = await db.delete(folders).returning()

				return NextResponse.json({
					success: true,
					action: 'clear-notes',
					deleted: {
						notes: deletedNotes.length,
						folders: deletedFolders.length,
					},
					message: `Deleted ${deletedNotes.length} notes and ${deletedFolders.length} folders`,
				})
			}

			case 'clear-settings': {
				const deleted = await db.delete(settings).returning()
				return NextResponse.json({
					success: true,
					action: 'clear-settings',
					deleted: deleted.length,
					message: `Deleted ${deleted.length} settings`,
				})
			}

			case 'clear-shortcuts': {
				const deleted = await db.delete(shortcuts).returning()
				return NextResponse.json({
					success: true,
					action: 'clear-shortcuts',
					deleted: deleted.length,
					message: `Deleted ${deleted.length} custom shortcuts`,
				})
			}

			case 'clear-all': {
				// Delete in order to respect constraints
				await db.delete(tasks)
				const deletedNotes = await db.delete(notes).returning()
				const deletedFolders = await db.delete(folders).returning()
				const deletedSettings = await db.delete(settings).returning()
				const deletedShortcuts = await db.delete(shortcuts).returning()

				return NextResponse.json({
					success: true,
					action: 'clear-all',
					deleted: {
						notes: deletedNotes.length,
						folders: deletedFolders.length,
						settings: deletedSettings.length,
						shortcuts: deletedShortcuts.length,
					},
					message: 'All data cleared',
				})
			}

			case 'stats': {
				const [noteCount, folderCount, taskCount, settingCount, shortcutCount] = await Promise.all([
					db.select().from(notes),
					db.select().from(folders),
					db.select().from(tasks),
					db.select().from(settings),
					db.select().from(shortcuts),
				])

				return NextResponse.json({
					success: true,
					action: 'stats',
					stats: {
						notes: noteCount.length,
						folders: folderCount.length,
						tasks: taskCount.length,
						settings: settingCount.length,
						shortcuts: shortcutCount.length,
					},
				})
			}

			case 'clear-cache': {
				// Clear Next.js build cache and restart dev server
				const { execSync } = require('child_process')

				try {
					// Clear Next.js cache
					execSync('rm -rf .next', { cwd: process.cwd(), stdio: 'pipe' })

					return NextResponse.json({
						success: true,
						action: 'clear-cache',
						message: 'Next.js cache cleared. The dev server will restart automatically.',
						restartRequired: true
					})
				} catch (error) {
					return NextResponse.json({
						success: false,
						action: 'clear-cache',
						error: 'Failed to clear cache',
						message: error instanceof Error ? error.message : String(error)
					}, { status: 500 })
				}
			}

			case 'restart-server': {
				// Trigger a graceful restart of the dev server
				return NextResponse.json({
					success: true,
					action: 'restart-server',
					message: 'Dev server restart triggered. The page will reload in 3 seconds.',
					restartRequired: true
				})
			}

			default:
				return NextResponse.json(
					{ error: `Unknown action: ${action}` },
					{ status: 400 }
				)
		}
	} catch (error) {
		console.error('Dev API error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Dev action failed', message: errorMessage },
			{ status: 500 }
		)
	}
}

// GET /api/dev - Get database stats
export async function GET() {
	if (!isDev()) {
		return NextResponse.json(
			{ error: 'Dev endpoints are only available in development mode' },
			{ status: 403 }
		)
	}

	try {
		const db = getDatabase()

		const [noteRows, folderRows, taskRows, settingRows, shortcutRows] = await Promise.all([
			db.select().from(notes),
			db.select().from(folders),
			db.select().from(tasks),
			db.select().from(settings),
			db.select().from(shortcuts),
		])

		return NextResponse.json({
			stats: {
				notes: noteRows.length,
				folders: folderRows.length,
				tasks: taskRows.length,
				settings: settingRows.length,
				shortcuts: shortcutRows.length,
				total: noteRows.length + folderRows.length,
			},
			environment: process.env.NODE_ENV,
			timestamp: new Date().toISOString(),
		})
	} catch (error) {
		console.error('Dev API error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to get stats', message: errorMessage },
			{ status: 500 }
		)
	}
}
