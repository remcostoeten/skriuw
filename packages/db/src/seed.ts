import { getDatabase, notes } from "./index";

const welcomeContent = [
	{
		id: 'welcome-h1',
		type: 'heading',
		props: {
			level: 1,
			textColor: 'default',
			backgroundColor: 'default',
			textAlignment: 'left'
		},
		content: [{ type: 'text', text: '👋 Welcome to Skriuw', styles: {} }],
		children: []
	},
	{
		id: 'welcome-p1',
		type: 'paragraph',
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [
			{
				type: 'text',
				text: 'A blazingly fast, privacy-focused note-taking app built with modern web technologies.',
				styles: {}
			}
		],
		children: []
	},
	{
		id: 'features-h2',
		type: 'heading',
		props: {
			level: 2,
			textColor: 'default',
			backgroundColor: 'default',
			textAlignment: 'left'
		},
		content: [{ type: 'text', text: '✨ Key Features', styles: {} }],
		children: []
	},
	{
		id: 'feature-1',
		type: 'bulletListItem',
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [
			{
				type: 'text',
				text: '📝 Rich text editor with slash commands and markdown support',
				styles: {}
			}
		],
		children: []
	},
	{
		id: 'feature-2',
		type: 'bulletListItem',
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [
			{
				type: 'text',
				text: '⌨️ Keyboard-first navigation with customizable shortcuts',
				styles: {}
			}
		],
		children: []
	},
	{
		id: 'feature-3',
		type: 'bulletListItem',
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [
			{ type: 'text', text: '📂 Hierarchical folders to organize your notes', styles: {} }
		],
		children: []
	},
	{
		id: 'feature-4',
		type: 'bulletListItem',
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text', text: '🔒 Privacy-focused: your data stays yours', styles: {} }],
		children: []
	},
	{
		id: 'happy-writing',
		type: 'paragraph',
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text', text: 'Happy writing! 🎉', styles: {} }],
		children: []
	}
]

async function seed() {
	console.log('Seeding database...')

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
			type: 'note'
		})

		console.log('Created welcome note')
	} else {
		console.log('Database already has notes, skipping seed')
	}

	console.log('Seeding complete')
	process.exit(0)
}

seed().catch((err) => {
	console.error('Seeding failed:', err)
	process.exit(1)
})
