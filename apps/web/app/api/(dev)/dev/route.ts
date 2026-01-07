import { NextRequest, NextResponse } from 'next/server'
import {
	getDatabase,
	notes,
	folders,
	tasks,
	settings,
	shortcuts,
	getSafeTimestamp
} from '@skriuw/db'
import { generateSampleData } from '@/app/api/(dev)/dev/seeds'
import { generateId } from '@skriuw/shared'
import { env } from '@/lib/env'
import { getCurrentUserId, getSession } from '@/lib/api-auth'
import { pingDatabase, checkSchemaSync, pushSchema, resetDatabase } from '@/lib/schema-utils'

async function isAdminOrDev() {
	if (process.env.NODE_ENV === 'development') return true

	const adminEmails = env.ADMIN_EMAILS?.split(',').map((e) => e.trim()) || []
	if (adminEmails.length === 0) return false

	const session = await getSession()
	const userEmail = session?.user?.email

	return userEmail && adminEmails.includes(userEmail)
}

export async function POST(request: NextRequest) {
	if (!(await isAdminOrDev())) {
		return NextResponse.json(
			{ error: 'Unauthorized: Dev endpoints are restricted to admins.' },
			{ status: 403 }
		)
	}

	try {
		const db = getDatabase()
		const body = await request.json()
		const action = body.action as string
		const userId = body.userId || (await getCurrentUserId())
		const dryRun = body.dryRun === true

		if (dryRun) {
			return NextResponse.json({
				success: true,
				action,
				dryRun: true,
				message: `Dry run for ${action} - no changes made`,
				userId,
				timestamp: new Date().toISOString()
			})
		}

		switch (action) {
			case 'seed': {
				const now = getSafeTimestamp()
				const createdItems: { notes: number; folders: number } = {
					notes: 0,
					folders: 0
				}

				try {
					const { sampleFolders, sampleNotes } = generateSampleData()
					for (const folderData of sampleFolders) {
						const folderId = generateId('folder')
						await db.insert(folders).values({
							id: folderId,
							name: folderData.name,
							parentFolderId: null,
							userId,
							pinned: 0,
							pinnedAt: null,
							createdAt: now,
							updatedAt: now,
							type: 'folder'
						})
						createdItems.folders++

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
									]),
									parentFolderId: folderId,
									userId,
									pinned: 0,
									pinnedAt: null,
									favorite: 0,
									createdAt: now + createdItems.notes,
									updatedAt: now + createdItems.notes,
									type: 'note'
								})
								createdItems.notes++
							}
						}
					}


					for (const noteData of sampleNotes) {
						await db.insert(notes).values({
							id: generateId('note'),
							name: noteData.name,
							content: JSON.stringify(noteData.content),
							parentFolderId: null,
							userId,
							pinned: noteData.pinned ? 1 : 0,
							pinnedAt: noteData.pinned ? now : null,
							favorite: 0,
							createdAt: now + createdItems.notes,
							updatedAt: now + createdItems.notes,
							type: 'note'
						})
						createdItems.notes++
					}

					return NextResponse.json({
						success: true,
						action: 'seed',
						created: createdItems,
						message: `Created ${createdItems.notes} notes and ${createdItems.folders} folders`
					})
				} catch (error) {
					console.error('Error seeding database:', error)
					return NextResponse.json({
						success: false,
						action: 'seed',
						error: error instanceof Error ? error.message : 'Unknown error occurred while seeding database'
					}, { status: 500 })
				}
			}

			case 'clear-notes': {
				await db.delete(tasks)
				const deletedNotes = await db.delete(notes).returning()
				const deletedFolders = await db.delete(folders).returning()

				return NextResponse.json({
					success: true,
					action: 'clear-notes',
					deleted: {
						notes: deletedNotes.length,
						folders: deletedFolders.length
					},
					message: `Deleted ${deletedNotes.length} notes and ${deletedFolders.length} folders`
				})
			}

			case 'clear-settings': {
				const deleted = await db.delete(settings).returning()
				return NextResponse.json({
					success: true,
					action: 'clear-settings',
					deleted: deleted.length,
					message: `Deleted ${deleted.length} settings`
				})
			}

			case 'clear-shortcuts': {
				const deleted = await db.delete(shortcuts).returning()
				return NextResponse.json({
					success: true,
					action: 'clear-shortcuts',
					deleted: deleted.length,
					message: `Deleted ${deleted.length} custom shortcuts`
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
						shortcuts: deletedShortcuts.length
					},
					message: 'All data cleared'
				})
			}

			case 'stats': {
				const [
					noteCount,
					folderCount,
					taskCount,
					settingCount,
					shortcutCount
				] = await Promise.all([
					db.select().from(notes),
					db.select().from(folders),
					db.select().from(tasks),
					db.select().from(settings),
					db.select().from(shortcuts)
				])

				return NextResponse.json({
					success: true,
					action: 'stats',
					stats: {
						notes: noteCount.length,
						folders: folderCount.length,
						tasks: taskCount.length,
						settings: settingCount.length,
						shortcuts: shortcutCount.length
					}
				})
			}

			case 'clear-cache': {
				const { exec } = require('child_process')
				const util = require('util')
				const execPromise = util.promisify(exec)

				try {
					// This will trigger a graceful restart of the Next.js dev server
					// by touching the next.config.ts file, which Next.js watches
					await execPromise('touch next.config.ts', {
						cwd: process.cwd()
					})

					return NextResponse.json({
						success: true,
						action: 'clear-cache',
						message: 'Cache cleared and server restart initiated.',
						restartRequired: true
					})
				} catch (error) {
					return NextResponse.json(
						{
							success: false,
							action: 'clear-cache',
							error: 'Failed to clear cache.',
							message:
								error instanceof Error
									? error.message
									: String(error)
						},
						{ status: 500 }
					)
				}
			}

			case 'ping-db': {
				const result = await pingDatabase()
				if (!result.connected) {
					throw new Error('Database connection failed')
				}
				return NextResponse.json({
					success: true,
					action: 'ping-db',
					provider: result.provider,
					message: 'Database connection successful'
				})
			}

			case 'check-schema': {
				const result = await checkSchemaSync()
				return NextResponse.json({
					success: result.inSync,
					action: 'check-schema',
					message: result.message,
					inSync: result.inSync
				})
			}

			case 'push-schema': {
				const result = await pushSchema()
				if (!result.success) {
					throw new Error(result.message)
				}
				return NextResponse.json({
					success: true,
					action: 'push-schema',
					message: result.message
				})
			}

			case 'reset-database': {
				const result = await resetDatabase()
				if (!result.success) {
					throw new Error(result.message)
				}
				return NextResponse.json({
					success: true,
					action: 'reset-database',
					message: result.message,
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
		const errorMessage =
			error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Dev action failed', message: errorMessage },
			{ status: 500 }
		)
	}
}

// GET /api/dev - Get database stats
export async function GET() {
	if (!(await isAdminOrDev())) {
		return NextResponse.json(
			{ error: 'Dev endpoints are restricted to admins.' },
			{ status: 403 }
		)
	}

	try {
		const db = getDatabase()
		const now = new Date()
		const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

		const [
			noteRows,
			folderRows,
			taskRows,
			settingRows,
			shortcutRows,
			userRows
		] = await Promise.all([
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
		const anonymousUsers = userRows.filter((u) => u.isAnonymous).length
		const anonymousUsersOld = userRows.filter(
			(u) => u.isAnonymous && new Date(u.createdAt) < twentyFourHoursAgo
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
				anonymousUsersOld
			},
			environment: process.env.NODE_ENV,
			timestamp: new Date().toISOString(),
			provider:
				process.env.DATABASE_PROVIDER ||
				(process.env.DATABASE_URL?.includes('neon')
					? 'neon'
					: 'postgres'),
			isAdmin: await isAdminOrDev()
		})
	} catch (error) {
		console.error('Dev API error:', error)
		const errorMessage =
			error instanceof Error ? error.message : String(error)
		return NextResponse.json(
			{ error: 'Failed to get stats', message: errorMessage },
			{ status: 500 }
		)
	}
}
