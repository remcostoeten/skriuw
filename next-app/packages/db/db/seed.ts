import { getDatabase, notes } from './index'

const welcomeContent = [
	{
		id: 'welcome-heading',
		type: 'heading',
		props: { level: 1 },
		content: [{ type: 'text', text: 'Welcome to Skriuw' }],
		children: [],
	},
	{
		id: 'welcome-paragraph',
		type: 'paragraph',
		content: [{ type: 'text', text: 'A blazingly fast, privacy-focused note-taking app.' }],
		children: [],
	},
]

async function seed() {
	console.log('🌱 Seeding database...')

	const db = getDatabase()
	const now = Date.now()

	// Check if welcome note already exists
	const existing = await db.select().from(notes).limit(1)

	if (existing.length === 0) {
		await db.insert(notes).values({
			id: `note-welcome-${now}`,
			name: 'Welcome to Skriuw',
			content: JSON.stringify(welcomeContent),
			parentFolderId: null,
			pinned: 1,
			pinnedAt: now,
			favorite: 0,
			createdAt: now,
			updatedAt: now,
			type: 'note',
		})

		console.log('✅ Created welcome note')
	} else {
		console.log('ℹ️ Database already has notes, skipping seed')
	}

	console.log('✅ Seeding complete')
	process.exit(0)
}

seed().catch((err) => {
	console.error('❌ Seeding failed:', err)
	process.exit(1)
})
