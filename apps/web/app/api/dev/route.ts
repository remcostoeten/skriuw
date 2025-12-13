import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, notes, folders, tasks, settings, shortcuts, schema, getSafeTimestamp } from '@skriuw/db'
import { sampleNotes, sampleFolders } from './seeds'
import { generateId } from '@skriuw/core-logic'
import { eq, lt } from 'drizzle-orm'
import { env } from '@skriuw/env/server'

export async function POST(request: NextRequest) {
	if (env.NODE_ENV !== 'development') {
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
					return NextResponse.json({
						success: false,
						action: 'clear-cache',
						error: 'Failed to clear cache.',
						message: error instanceof Error ? error.message : String(error)
					}, { status: 500 })
				}
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
	if (env.NODE_ENV !== 'development') {
		return NextResponse.json(
			{ error: 'Dev endpoints are only available in development mode' },
			{ status: 403 }
		)
	}

	try {
		const db = getDatabase()
		const now = new Date()
		const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

		const [noteRows, folderRows, taskRows, settingRows, shortcutRows, userRows] = await Promise.all([
			db.select().from(notes),
			db.select().from(folders),
			db.select().from(tasks),
			db.select().from(settings),
			db.select().from(shortcuts),
			db.query.user.findMany({
				columns: { id: true, isAnonymous: true, createdAt: true }
			})
		])

		// Calculate user statistics
		const totalUsers = userRows.length
		const anonymousUsers = userRows.filter(u => u.isAnonymous).length
		const anonymousUsersOld = userRows.filter(u =>
			u.isAnonymous && new Date(u.createdAt) < twentyFourHoursAgo
		).length

		return NextResponse.json({
			stats: {
				notes: noteRows.length,
				folders: folderRows.length,
				tasks: taskRows.length,
				settings: settingRows.length,
				shortcuts: shortcutRows.length,
				total: noteRows.length + folderRows.length,
				users: totalUsers,
				anonymousUsers,
				anonymousUsersOld,
			},
			environment: env.NODE_ENV,
			timestamp: new Date().toISOString(),
			provider: env.DATABASE_PROVIDER || (env.DATABASE_URL?.includes('neon') ? 'neon' : 'postgres'),
			cronConfigured: !!env.CRON_SECRET
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
