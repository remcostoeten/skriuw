import * as schema from "../src/schema";
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const NOTES = [
	{ name: 'Welcome to Skriuw', pinned: true },
	{ name: 'Keyboard Shortcuts', folder: 'Getting Started' },
	{ name: 'Editor Features', folder: 'Getting Started' },
	{ name: 'Architecture Overview', folder: 'Documentation' },
	{ name: 'Storage & Backup', folder: 'Documentation' },
	{ name: 'Sync Seeds Workflow', folder: 'Developer Knowledge' },
	{ name: 'Project Ideas', folder: 'Work' },
	{ name: 'Meeting Notes', folder: 'Work' }
] as const

const FOLDERS = [
	{ name: 'Getting Started', pinned: true },
	{ name: 'Documentation', pinned: false },
	{ name: 'Personal', pinned: false },
	{ name: 'Work', pinned: false },
	{ name: 'Developer Knowledge', pinned: false }
] as const

let blockIdCounter = 0

function createId(prefix: string): string {
	return `${prefix}-${++blockIdCounter}`
}

function resetBlockIdCounter() {
	blockIdCounter = 0
}

function heading(level: 1 | 2 | 3, text: string) {
	return {
		id: createId('h'),
		type: 'heading' as const,
		props: { level, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text' as const, text, styles: {} }],
		children: []
	}
}

function paragraph(text: string, styles: Record<string, boolean> = {}) {
	return {
		id: createId('p'),
		type: 'paragraph' as const,
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: text ? [{ type: 'text' as const, text, styles }] : [],
		children: []
	}
}

function bulletItem(text: string) {
	return {
		id: createId('li'),
		type: 'bulletListItem' as const,
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text' as const, text, styles: {} }],
		children: []
	}
}

function numberedItem(text: string) {
	return {
		id: createId('ni'),
		type: 'numberedListItem' as const,
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text' as const, text, styles: {} }],
		children: []
	}
}

function codeBlock(code: string, language = 'text') {
	return {
		id: createId('code'),
		type: 'codeBlock' as const,
		props: { language },
		content: [{ type: 'text' as const, text: code, styles: {} }],
		children: []
	}
}

function generateContentForNote(noteName: string): string {
	resetBlockIdCounter()

	switch (noteName) {
		case 'Sync Seeds Workflow':
			return JSON.stringify([
				heading(1, '🌱 Sync Seeds Workflow'),
				paragraph(
					'This guide explains how Skriuw maintains consistent seed data for both Guest and Authenticated users.'
				),
				paragraph(''),
				heading(2, 'The Problem'),
				paragraph('Previously, we had two sources of truth:'),
				numberedItem('`preseed-data.ts` for Guest users (localStorage)'),
				numberedItem('Database tables for Authenticated users'),
				paragraph(
					'This led to "drift" where guests would see different content than signed-up users.'
				),
				paragraph(''),
				heading(2, 'The Solution'),
				paragraph(
					'We now use a **Unified Seed System**. The `sync-seeds` script acts as the bridge:'
				),
				codeBlock('bun sync-seeds', 'bash'),
				paragraph('This script performs the following actions:'),
				numberedItem(
					'Reads the Single Source of Truth from `packages/db/scripts/sync-seeds.ts`'
				),
				numberedItem('Wipes the `seed_template_notes` and `seed_template_folders` tables'),
				numberedItem('Re-inserts clean, up-to-date data'),
				paragraph(''),
				heading(2, 'How to Update Seeds'),
				numberedItem('Open `packages/db/scripts/sync-seeds.ts`'),
				numberedItem('Edit the `NOTES` or `FOLDERS` arrays'),
				numberedItem('Run `bun sync-seeds` to apply changes to the database'),
				paragraph(''),
				paragraph(
					'Now, every new user account will be initialized with exactly these notes! 🚀'
				)
			])

		case 'Welcome to Skriuw':
			return JSON.stringify([
				heading(1, '👋 Welcome to Skriuw'),
				paragraph(
					'A blazingly fast, privacy-focused note-taking app built with modern web technologies.'
				),
				paragraph(''),
				heading(2, '✨ Key Features'),
				bulletItem('📝 Rich text editor with slash commands and markdown support'),
				bulletItem('⌨️ Keyboard-first navigation with customizable shortcuts'),
				bulletItem('📂 Hierarchical folders to organize your notes'),
				bulletItem('🔍 Fast search across all your notes'),
				bulletItem('🌓 Dark/light mode with beautiful UI'),
				bulletItem('☁️ Cloud backup to Google Drive or Dropbox'),
				bulletItem('🔒 Privacy-focused: your data stays yours'),
				paragraph(''),
				heading(2, '🚀 Quick Start'),
				numberedItem('Press Ctrl+N (or ⌘N on Mac) to create a new note'),
				numberedItem('Press Ctrl+F to create a new folder'),
				numberedItem('Type / in the editor to see all block types'),
				numberedItem('Press Ctrl+/ to view all keyboard shortcuts'),
				paragraph(''),
				heading(2, '💡 Tips'),
				bulletItem('Double-click any note or folder to rename it'),
				bulletItem('Drag and drop to reorganize your notes'),
				bulletItem('Use Ctrl+P to open the command palette'),
				bulletItem('Pin important notes to keep them at the top'),
				paragraph(''),
				paragraph('Happy writing! 🎉')
			])

		case 'Keyboard Shortcuts':
			return JSON.stringify([
				heading(1, '⌨️ Keyboard Shortcuts'),
				paragraph(
					'Master Skriuw with these keyboard shortcuts. All shortcuts are customizable in Settings.'
				),
				paragraph(''),
				heading(2, '📋 General'),
				bulletItem('Ctrl+P / Cmd+K — Open Command Palette'),
				bulletItem('Ctrl+N — New Note'),
				bulletItem('Ctrl+F — New Folder'),
				bulletItem('Ctrl+S — Save Note'),
				bulletItem('Ctrl+, — Open Settings'),
				bulletItem('Ctrl+/ — Show All Shortcuts'),
				paragraph(''),
				heading(2, '🧭 Navigation'),
				bulletItem('Ctrl+B — Toggle Sidebar'),
				bulletItem('Alt+T — Toggle Theme'),
				bulletItem('/ — Focus Editor'),
				bulletItem('Escape — Clear Focus')
			])

		case 'Editor Features':
			return JSON.stringify([
				heading(1, '📝 Editor Features'),
				paragraph(
					'Skriuw uses a powerful block-based editor with rich formatting options.'
				),
				paragraph(''),
				heading(2, '📦 Block Types'),
				paragraph('Type / in the editor to see all available blocks:'),
				bulletItem('Headings (H1, H2, H3) — Structure your content'),
				bulletItem('Paragraphs — Regular text content'),
				bulletItem('Bullet Lists — Unordered lists'),
				bulletItem('Numbered Lists — Ordered lists'),
				bulletItem('Todo Items — Checkboxes for tasks'),
				bulletItem('Code Blocks — Syntax-highlighted code')
			])

		case 'Architecture Overview':
			return JSON.stringify([
				heading(1, '🏗️ Architecture Overview'),
				paragraph(
					'Skriuw is built with modern web technologies for maximum performance and developer experience.'
				),
				paragraph(''),
				heading(2, '🛠️ Technology Stack'),
				bulletItem('Next.js 15 — React framework with App Router'),
				bulletItem('React 18 — UI library with Server Components'),
				bulletItem('TypeScript — Type-safe development'),
				bulletItem('PostgreSQL + Drizzle ORM — Database layer'),
				bulletItem('BlockNote — Rich text editor'),
				bulletItem('Tailwind CSS — Utility-first styling'),
				bulletItem('Framer Motion — Smooth animations'),
				paragraph(''),
				heading(2, '📊 Data Flow'),
				codeBlock(
					`Frontend Components
      ↓
React Hooks (useNotes, etc.)
      ↓
Storage Adapter
      ↓
Next.js API Routes
      ↓
Drizzle ORM
      ↓
PostgreSQL`,
					'text'
				)
			])

		case 'Storage & Backup':
			return JSON.stringify([
				heading(1, '☁️ Storage & Backup'),
				paragraph('Keep your notes safe with cloud backup integration.'),
				paragraph(''),
				heading(2, '📦 Backup Providers'),
				bulletItem('Google Drive — Sync notes to your Google account'),
				bulletItem('Dropbox — Backup to Dropbox app folder'),
				bulletItem('Local Storage — For desktop (Tauri) users'),
				paragraph(''),
				heading(2, '🔐 Security'),
				bulletItem('All connections use OAuth2 authentication'),
				bulletItem('Sensitive tokens are encrypted at rest'),
				bulletItem('App-only folder access (cannot read other files)')
			])

		case 'Project Ideas':
			return JSON.stringify([
				heading(2, 'Project Ideas'),
				paragraph('Add your project ideas here...')
			])

		case 'Meeting Notes':
			return JSON.stringify([
				heading(2, 'Meeting Notes'),
				paragraph('Capture your meeting notes here...')
			])

		default:
			return JSON.stringify([paragraph('')])
	}
}

function stableId(prefix: string, name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
	return `${prefix}-template-${slug}`
}

async function syncSeeds() {
	console.log('🌱 Syncing preseed data to database...\n')

	const url = process.env.DATABASE_URL
	if (!url) {
		console.error('❌ DATABASE_URL is not set. Please set it in .env or .env.local')
		process.exit(1)
	}

	const queryClient = postgres(url)
	const db = drizzle(queryClient, { schema })

	const now = Date.now()

	await db.transaction(async (tx) => {
		console.log('🗑️  Clearing existing seed templates...')
		await tx.delete(schema.seedTemplateNotes)
		await tx.delete(schema.seedTemplateFolders)
		console.log('   ✓ Cleared seed_template_notes and seed_template_folders\n')

		console.log('📁 Inserting folders...')
		const folderMap = new Map<string, string>()

		for (let i = 0; i < FOLDERS.length; i++) {
			const folderDef = FOLDERS[i]
			const folderId = stableId('folder', folderDef.name)
			folderMap.set(folderDef.name, folderId)

			await tx.insert(schema.seedTemplateFolders).values({
				id: folderId,
				name: folderDef.name,
				parentFolderId: null,
				order: i,
				createdAt: now,
				updatedAt: now
			})
			console.log(`   ✓ ${folderDef.name}`)
		}

		console.log('\n📝 Inserting notes...')
		for (let i = 0; i < NOTES.length; i++) {
			const noteDef = NOTES[i]
			const noteId = stableId('note', noteDef.name)
			const parentFolderId = noteDef.folder ? (folderMap.get(noteDef.folder) ?? null) : null

			const content = generateContentForNote(noteDef.name)

			await tx.insert(schema.seedTemplateNotes).values({
				id: noteId,
				name: noteDef.name,
				content,
				parentFolderId,
				pinned: noteDef.pinned ? 1 : 0,
				order: i,
				createdAt: now,
				updatedAt: now
			})
			console.log(`   ✓ ${noteDef.name}${parentFolderId ? ` (in ${noteDef.folder})` : ''}`)
		}
	})

	console.log('\n✅ Seed sync complete!')
	console.log(`   Folders: ${FOLDERS.length}`)
	console.log(`   Notes: ${NOTES.length}`)

	await queryClient.end()
	process.exit(0)
}

syncSeeds().catch((err) => {
	console.error('❌ Seed sync failed:', err)
	process.exit(1)
})
