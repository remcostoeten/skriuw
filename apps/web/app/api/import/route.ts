import { getDatabase, notes, folders, getSafeTimestamp } from '@skriuw/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireMutation } from '@/lib/api-auth'
import { ImportPayloadSchema, type ImportItem } from '@skriuw/core'
import { sql } from 'drizzle-orm'

export async function POST(request: NextRequest) {
	try {
		// 1. Security: Authentication Check
		const auth = await requireMutation()
		if (!auth.authenticated) {
			return auth.response
		}
		const { userId } = auth

		// 2. Security: Payload Size Check
		const contentLength = request.headers.get('content-length')
		if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
			// 5MB limit
			const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2)
			return NextResponse.json(
				{
					error: 'Payload too large',
					message: `Import size ${sizeMB}MB exceeds 5MB limit`
				},
				{ status: 413 }
			)
		}

		const body = await request.json()

		// 3. Validation: Recursive Zod Schema
		const result = ImportPayloadSchema.safeParse(body)
		if (!result.success) {
			return NextResponse.json(
				{ error: 'Invalid payload', details: result.error.flatten() },
				{ status: 400 }
			)
		}

		const { items } = result.data
		const db = getDatabase()
		const now = getSafeTimestamp()

		// 4. Performance: Flatten and Batch
		const foldersToInsert: any[] = []
		const notesToInsert: any[] = []

		// Helper to flatten the tree
		function processItem(item: ImportItem) {
			const isFolder = item.type === 'folder'

			if (isFolder) {
				foldersToInsert.push({
					id: item.id,
					name: item.name,
					parentFolderId: item.parentFolderId || null,
					userId: userId, // 5. Security: Inject User ID
					pinned: item.pinned ? 1 : 0,
					pinnedAt: item.pinnedAt || null,
					deletedAt: null, // Ensure imported items are not deleted
					createdAt: item.createdAt || now,
					updatedAt: item.updatedAt || now,
					type: 'folder'
				})

				if (item.children && Array.isArray(item.children)) {
					for (const child of item.children) {
						processItem(child)
					}
				}
			} else {
				notesToInsert.push({
					id: item.id,
					name: item.name,
					content:
						typeof item.content === 'string'
							? item.content
							: JSON.stringify(item.content || ''),
					parentFolderId: item.parentFolderId || null,
					userId: userId, // 5. Security: Inject User ID
					pinned: item.pinned ? 1 : 0,
					pinnedAt: item.pinnedAt || null,
					favorite: item.favorite ? 1 : 0,
					deletedAt: null,
					createdAt: item.createdAt || now,
					updatedAt: item.updatedAt || now,
					type: 'note'
				})
			}
		}

		// Process all root items
		for (const item of items) {
			processItem(item)
		}

		// Execute Batched Inserts in Transaction
		await db.transaction(async (tx) => {
			// 1. Insert Folders
			if (foldersToInsert.length > 0) {
				const chunkSize = 1000
				for (let i = 0; i < foldersToInsert.length; i += chunkSize) {
					const chunk = foldersToInsert.slice(i, i + chunkSize)
					await tx
						.insert(folders)
						.values(chunk)
						.onConflictDoUpdate({
							target: folders.id,
							set: {
								name: sql`excluded.name`,
								parentFolderId: sql`excluded.parent_folder_id`,
								updatedAt: sql`excluded.updated_at`
								// Keep existing user_id ownership implies if we allow update
							}
						})
				}
			}

			// 2. Insert Notes
			if (notesToInsert.length > 0) {
				const chunkSize = 1000
				for (let i = 0; i < notesToInsert.length; i += chunkSize) {
					const chunk = notesToInsert.slice(i, i + chunkSize)
					await tx
						.insert(notes)
						.values(chunk)
						.onConflictDoUpdate({
							target: notes.id,
							set: {
								name: sql`excluded.name`,
								content: sql`excluded.content`,
								parentFolderId: sql`excluded.parent_folder_id`,
								updatedAt: sql`excluded.updated_at`
							}
						})
				}
			}
		})

		return NextResponse.json({
			success: true,
			stats: {
				folders: foldersToInsert.length,
				notes: notesToInsert.length
			}
		})
	} catch (error) {
		console.error('Import failed:', error)
		return NextResponse.json(
			{
				error: 'Import failed',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		)
	}
}
