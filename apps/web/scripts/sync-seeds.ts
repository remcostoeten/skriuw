import { generatePreseededItems } from '../lib/preseed-data'
import { resetBlockIdCounter } from '../lib/preseed-data'
import { getDatabase, seedTemplateFolders, seedTemplateNotes } from '@skriuw/db'

async function syncSeeds() {
	console.log('🌱 Starting seed synchronization...')

	// 1. Generate the source of truth data (from code)
	// We use a dummy userId because seed templates don't track user ownership
	const items = generatePreseededItems('template_user')

	const folders = items.filter((i) => i.type === 'folder')
	const notes = items.filter((i) => i.type === 'note')

	console.log(`Found ${folders.length} folders and ${notes.length} notes in preseed-data.ts`)

	const db = getDatabase()

	try {
		// 2. Clear existing templates
		console.log('Clearing existing template tables...')
		await db.delete(seedTemplateNotes)
		await db.delete(seedTemplateFolders)

		// 3. Insert Folders
		// Maintain order based on array index
		console.log('Inserting folders...')
		for (let i = 0; i < folders.length; i++) {
			const folder = folders[i]
			await db.insert(seedTemplateFolders).values({
				id: folder.id,
				name: folder.name,
				parentFolderId: folder.parentFolderId || null, // Convert undefined to null
				order: i,
				createdAt: Date.now(),
				updatedAt: Date.now()
			})
		}

		// 4. Insert Notes
		console.log('Inserting notes...')
		for (let i = 0; i < notes.length; i++) {
			const note = notes[i]
			// Note content in Item is array/object. DB expects stringified JSON (text column).
			// preseed-data.ts returns "content" as array of blocks.
			// schema.ts: content: text('content').notNull() -> "BlockNote JSON"

			// Explicit cast 'any' because Item definitions might vary slightly from Table usage
			const contentJson = JSON.stringify(note.content)

			await db.insert(seedTemplateNotes).values({
				id: note.id,
				name: note.name,
				content: contentJson,
				parentFolderId: note.parentFolderId || null,
				pinned: note.pinned ? 1 : 0,
				order: i,
				createdAt: Date.now(),
				updatedAt: Date.now()
			})
		}

		console.log('✅ Seed synchronization complete!')
		process.exit(0)
	} catch (error) {
		console.error('❌ Error syncing seeds:', error)
		process.exit(1)
	}
}

syncSeeds()
