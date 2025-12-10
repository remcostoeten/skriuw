import { NextRequest, NextResponse } from 'next/server'
import {
	getDatabase,
	notes,
	folders,
	tasks,
	settings,
	shortcuts,
	getSafeTimestamp,
} from '@skriuw/db'
import { sampleNotes, sampleFolders } from './seeds'
import { generateId } from '@skriuw/core-logic'
import { isDevelopment, database } from '@skriuw/env/server'

function isDev() {
	return isDevelopment()
}

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
										props: {
											textColor: 'default',
											backgroundColor: 'default',
											textAlignment: 'left',
										},
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
				const { exec } = require('child_process')

				try {
					// This will trigger a graceful restart of the Next.js dev server
					// by touching the next.config.ts file, which Next.js watches
					exec('touch next.config.ts', { cwd: process.cwd() }, (err: Error | null) => {
						if (err) {
							console.error('Failed to touch next.config.ts:', err)
						}
					})

					return NextResponse.json({
						success: true,
						action: 'clear-cache',
						message: 'Cache cleared and server restart initiated.',
						restartRequired: true,
					})
				} catch (error) {
					return NextResponse.json(
						{
							success: false,
							action: 'clear-cache',
							error: 'Failed to clear cache.',
							message: error instanceof Error ? error.message : String(error),
						},
						{ status: 500 }
					)
				}
			}

			default:
				return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
		}
	} catch (error) {
		console.error('Dev API error:', error)
		const errorMessage = error instanceof Error ? error.message : String(error)
		return NextResponse.json({ error: 'Dev action failed', message: errorMessage }, { status: 500 })
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

		// Extract schema column names dynamically
		const getSchemaColumns = (table: any) => {
			// Drizzle table objects contain column definitions as properties
			// We can get them by filtering for objects that look like columns (have a 'name' and 'dataType')
			// Or simpler: use getTableColumns if available, or just iterate known tables if we want simple strings
			// For now, let's try to extract keys that are likely columns
			// Actually, we can use the getTableColumns utility from drizzle-orm if we import it,
			// but let's try to just inspect the imported table objects which are already available.
			const columns: string[] = []
			for (const key in table) {
				if (table[key] && typeof table[key] === 'object' && 'name' in table[key]) {
					columns.push(table[key].name)
				}
			}
			return columns.join(', ')
		}

		const schemaInfo = {
			notes: getSchemaColumns(notes),
			folders: getSchemaColumns(folders),
			tasks: getSchemaColumns(tasks),
			settings: getSchemaColumns(settings),
			shortcuts: getSchemaColumns(shortcuts),
		}

		return NextResponse.json({
			stats: {
				notes: noteRows.length,
				folders: folderRows.length,
				tasks: taskRows.length,
				settings: settingRows.length,
				shortcuts: shortcutRows.length,
				total: noteRows.length + folderRows.length,
			},
			schema: schemaInfo, // Send dynamic schema info
			environment: process.env.NODE_ENV,
			timestamp: new Date().toISOString(),
			provider: database.provider,
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
