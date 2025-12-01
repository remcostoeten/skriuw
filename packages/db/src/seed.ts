/**
 * Database seed script
 * 
 * Seeds the database with initial data (folders, notes, settings)
 * Run with: pnpm seed or node dist/seed.js
 */

import { getDatabase } from './client.js'
import { folders, notes, settings } from './schema.js'

export interface SeedData {
	folders: Array<{
		id: string
		name: string
		parentFolderId?: string | null
		pinned?: number
		pinnedAt?: number | null
		createdAt: number
		updatedAt: number
	}>
	notes: Array<{
		id: string
		name: string
		content: string
		parentFolderId?: string | null
		pinned?: number
		pinnedAt?: number | null
		favorite?: number
		createdAt: number
		updatedAt: number
		type?: string
	}>
	settings?: Array<{
		id: string
		key: string
		value: string
		updatedAt: number
	}>
}

/**
 * Default seed data
 */
const defaultSeedData: SeedData = {
	folders: [
		{
			id: 'folder-todo',
			name: 'To Do',
			parentFolderId: null,
			pinned: 0,
			pinnedAt: null,
			createdAt: Date.now(),
			updatedAt: Date.now()
		},
		{
			id: 'folder-servo',
			name: 'servo',
			parentFolderId: 'folder-todo',
			pinned: 0,
			pinnedAt: null,
			createdAt: Date.now(),
			updatedAt: Date.now()
		},
		{
			id: 'folder-releases',
			name: 'Releases',
			parentFolderId: null,
			pinned: 0,
			pinnedAt: null,
			createdAt: Date.now(),
			updatedAt: Date.now()
		}
	],
	notes: [
		{
			id: 'note-welcome',
			name: 'Welcome',
			content: JSON.stringify([
				{
					id: 'block-1',
					type: 'paragraph',
					props: {},
					content: [],
					children: []
				}
			]),
			parentFolderId: null,
			pinned: 0,
			pinnedAt: null,
			favorite: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			type: 'note'
		}
	]
}

/**
 * Seed the database with initial data
 */
export async function seedDatabase(customSeedData?: Partial<SeedData>): Promise<void> {
	const db = await getDatabase()
	const seedData: SeedData = {
		folders: customSeedData?.folders || defaultSeedData.folders,
		notes: customSeedData?.notes || defaultSeedData.notes,
		settings: customSeedData?.settings || defaultSeedData.settings
	}

	try {
		console.log('🌱 Starting database seed...')

		// Check if data already exists
		const existingFolders = await db.select().from(folders).limit(1)
		const existingNotes = await db.select().from(notes).limit(1)

		if (existingFolders.length > 0 || existingNotes.length > 0) {
			console.log('⚠️  Database already contains data. Skipping seed.')
			console.log('   Use --force flag or clear database first to re-seed.')
			return
		}

		// Insert folders
		if (seedData.folders.length > 0) {
			await db.insert(folders).values(
				seedData.folders.map(f => ({
					id: f.id,
					name: f.name,
					parentFolderId: f.parentFolderId || null,
					pinned: f.pinned || 0,
					pinnedAt: f.pinnedAt || null,
					createdAt: f.createdAt,
					updatedAt: f.updatedAt,
					type: 'folder'
				}))
			)
			console.log(`✅ Inserted ${seedData.folders.length} folders`)
		}

		// Insert notes
		if (seedData.notes.length > 0) {
			await db.insert(notes).values(
				seedData.notes.map(n => ({
					id: n.id,
					name: n.name,
					content: n.content,
					parentFolderId: n.parentFolderId || null,
					pinned: n.pinned || 0,
					pinnedAt: n.pinnedAt || null,
					favorite: n.favorite || 0,
					createdAt: n.createdAt,
					updatedAt: n.updatedAt,
					type: n.type || 'note'
				}))
			)
			console.log(`✅ Inserted ${seedData.notes.length} notes`)
		}

		// Insert settings (optional)
		if (seedData.settings && seedData.settings.length > 0) {
			await db.insert(settings).values(
				seedData.settings.map(s => ({
					id: s.id,
					key: s.key,
					value: s.value,
					updatedAt: s.updatedAt
				}))
			)
			console.log(`✅ Inserted ${seedData.settings.length} settings`)
		}

		console.log('✨ Database seeded successfully!')
	} catch (error) {
		console.error('❌ Failed to seed database:', error)
		throw error
	}
}

/**
 * Clear all data from the database (USE WITH CAUTION)
 */
export async function clearDatabase(): Promise<void> {
	const db = await getDatabase()

	try {
		console.log('🗑️  Clearing database...')

		await db.delete(notes)
		await db.delete(folders)
		await db.delete(settings)

		console.log('✅ Database cleared successfully!')
	} catch (error) {
		console.error('❌ Failed to clear database:', error)
		throw error
	}
}

/**
 * Main function for CLI usage
 */
async function main() {
	const args = process.argv.slice(2)
	const force = args.includes('--force') || args.includes('-f')
	const clear = args.includes('--clear') || args.includes('-c')

	try {
		if (clear) {
			await clearDatabase()
			if (!force) {
				console.log('💡 Add --force to seed after clearing')
				return
			}
		}

		if (force) {
			if (!clear) {
				await clearDatabase()
			}
			await seedDatabase()
		} else {
			await seedDatabase()
		}
	} catch (error) {
		console.error('Seed failed:', error)
		process.exit(1)
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main()
}

