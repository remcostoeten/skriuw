import type { Note, Folder, Item } from "@/features/notes/types";

// ============================================================================
// Block Helpers - Create BlockNote-compatible blocks
// ============================================================================

let blockIdCounter = 0

export function resetBlockIdCounter() {
	blockIdCounter = 0
}

function createId(prefix: string): string {
	return `${prefix}-${++blockIdCounter}`
}

export function heading(level: 1 | 2 | 3, text: string) {
	return {
		id: createId('h'),
		type: 'heading' as const,
		props: { level, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text' as const, text, styles: {} }],
		children: []
	}
}

export function paragraph(text: string, styles: Record<string, boolean> = {}) {
	return {
		id: createId('p'),
		type: 'paragraph' as const,
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: text ? [{ type: 'text' as const, text, styles }] : [],
		children: []
	}
}

export function bulletItem(text: string) {
	return {
		id: createId('li'),
		type: 'bulletListItem' as const,
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text' as const, text, styles: {} }],
		children: []
	}
}

export function numberedItem(text: string) {
	return {
		id: createId('ni'),
		type: 'numberedListItem' as const,
		props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
		content: [{ type: 'text' as const, text, styles: {} }],
		children: []
	}
}

export function codeBlock(code: string, language = 'text') {
	return {
		id: createId('code'),
		type: 'codeBlock' as const,
		props: { language },
		content: [{ type: 'text' as const, text: code, styles: {} }],
		children: []
	}
}

// ============================================================================
// Note Content
// ============================================================================

const WELCOME_CONTENT = [
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
]

const SHORTCUTS_CONTENT = [
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
	bulletItem('Escape — Clear Focus'),
	paragraph(''),
	heading(2, '📄 Split View'),
	bulletItem('Ctrl+\\ — Toggle Split View'),
	bulletItem('Shift+Ctrl+\\ — Swap Panes'),
	bulletItem('Ctrl+Alt+V — Vertical Split'),
	bulletItem('Ctrl+Alt+H — Horizontal Split'),
	bulletItem('Ctrl+Alt+← / → — Focus Left/Right Pane'),
	bulletItem('Ctrl+Alt+W — Close Active Pane'),
	paragraph(''),
	heading(2, '📝 Editor'),
	bulletItem('/ — Open Slash Menu'),
	bulletItem('Ctrl+B — Bold'),
	bulletItem('Ctrl+I — Italic'),
	bulletItem('Ctrl+U — Underline'),
	bulletItem('Ctrl+Z — Undo'),
	bulletItem('Ctrl+Shift+Z — Redo'),
	paragraph(''),
	heading(2, '🗂️ Sidebar'),
	bulletItem('Enter — Open Note'),
	bulletItem('Delete — Delete Item'),
	bulletItem('Ctrl+Click — Multi-select'),
	bulletItem('Shift+Click — Range Select'),
	bulletItem('Arrow Keys — Navigate Items')
]

const EDITOR_FEATURES_CONTENT = [
	heading(1, '📝 Editor Features'),
	paragraph('Skriuw uses a powerful block-based editor with rich formatting options.'),
	paragraph(''),
	heading(2, '📦 Block Types'),
	paragraph('Type / in the editor to see all available blocks:'),
	bulletItem('Headings (H1, H2, H3) — Structure your content'),
	bulletItem('Paragraphs — Regular text content'),
	bulletItem('Bullet Lists — Unordered lists'),
	bulletItem('Numbered Lists — Ordered lists'),
	bulletItem('Todo Items — Checkboxes for tasks'),
	bulletItem('Code Blocks — Syntax-highlighted code'),
	bulletItem('Quotes — Block quotes'),
	bulletItem('Tables — Structured data'),
	paragraph(''),
	heading(2, '✏️ Formatting'),
	bulletItem('Bold — Ctrl+B or **text**'),
	bulletItem('Italic — Ctrl+I or *text*'),
	bulletItem('Underline — Ctrl+U'),
	bulletItem('Strikethrough — ~~text~~'),
	bulletItem('Code — `inline code`'),
	bulletItem('Links — Ctrl+K or [text](url)'),
	paragraph(''),
	heading(2, '🔗 Mentions & Links'),
	bulletItem('Type @ to mention another note'),
	bulletItem('Mentions create navigable links between notes'),
	bulletItem('Build your personal knowledge graph'),
	paragraph(''),
	heading(2, '💾 Auto-Save'),
	paragraph('Your notes are automatically saved as you type. No need to manually save!')
]

const ARCHITECTURE_CONTENT = [
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
	),
	paragraph(''),
	heading(2, '📁 Key Directories'),
	bulletItem('app/ — Next.js pages and API routes'),
	bulletItem('features/ — Feature-based modules'),
	bulletItem('components/ — Shared UI components'),
	bulletItem('lib/ — Utilities and configurations'),
	paragraph(''),
	heading(2, '🚀 Deployment'),
	bulletItem('Platform: Vercel'),
	bulletItem('Database: Neon (serverless PostgreSQL)'),
	bulletItem('Desktop: Tauri (optional)')
]

const BACKUP_CONTENT = [
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
	bulletItem('App-only folder access (cannot read other files)'),
	paragraph(''),
	heading(2, '⚙️ Setup'),
	numberedItem('Go to Settings → Backup'),
	numberedItem('Click "Connect" for your preferred provider'),
	numberedItem('Authorize access to your account'),
	numberedItem('Enable automatic backups or sync manually'),
	paragraph(''),
	heading(2, '🔮 Coming Soon'),
	bulletItem('Automated background backups'),
	bulletItem('Version history for backups'),
	bulletItem('One-click restore')
]

// ============================================================================
// Note and Folder Definitions
// ============================================================================

type NoteDefinition = {
	name: string
	content: any[] // BlockNote content - using any to avoid complex union types
	pinned?: boolean
	favorite?: boolean
	folder?: string
}

const NOTES: NoteDefinition[] = [
	{ name: 'Welcome to Skriuw', content: WELCOME_CONTENT, pinned: true },
	{ name: 'Keyboard Shortcuts', content: SHORTCUTS_CONTENT, folder: 'Getting Started' },
	{ name: 'Editor Features', content: EDITOR_FEATURES_CONTENT, folder: 'Getting Started' },
	{ name: 'Architecture Overview', content: ARCHITECTURE_CONTENT, folder: 'Documentation' },
	{ name: 'Storage & Backup', content: BACKUP_CONTENT, folder: 'Documentation' },
	{
		name: 'Project Ideas',
		content: [heading(2, 'Project Ideas'), paragraph('Add your project ideas here...')],
		folder: 'Work'
	},
	{
		name: 'Meeting Notes',
		content: [heading(2, 'Meeting Notes'), paragraph('Capture your meeting notes here...')],
		folder: 'Work'
	}
]

const FOLDERS = [
	{ name: 'Getting Started', pinned: true },
	{ name: 'Documentation' },
	{ name: 'Personal' },
	{ name: 'Work' }
]

// ============================================================================
// Public API
// ============================================================================

function stableId(prefix: string, name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
	return `${prefix}-preseed-${slug}`
}

export function generatePreseededItems(userId: string): Item[] {
	// Reset block ID counter for deterministic IDs
	blockIdCounter = 0

	const now = Date.now()
	const items: Item[] = []
	const folderMap = new Map<string, string>()

	// Create folders
	for (const folderDef of FOLDERS) {
		const folderId = stableId('folder', folderDef.name)
		folderMap.set(folderDef.name, folderId)

		const folder: Folder = {
			id: folderId,
			name: folderDef.name,
			type: 'folder',
			children: [],
			parentFolderId: undefined,
			pinned: folderDef.pinned ?? false,
			createdAt: now,
			updatedAt: now,
			userId
		}
		items.push(folder)
	}

	// Create notes
	for (const noteDef of NOTES) {
		const noteId = stableId('note', noteDef.name)
		const parentFolderId = noteDef.folder ? folderMap.get(noteDef.folder) : undefined

		const note: Note = {
			id: noteId,
			name: noteDef.name,
			type: 'note',
			content: noteDef.content,
			parentFolderId,
			pinned: noteDef.pinned ?? false,
			favorite: noteDef.favorite ?? false,
			createdAt: now,
			updatedAt: now,
			userId
		}
		items.push(note)
	}

	return items
}

export function hasPreseededItems(): boolean {
	if (typeof window === 'undefined') return false
	return localStorage.getItem('zero_session:preseeded') === 'true'
}

export function markPreseededItems(): void {
	if (typeof window === 'undefined') return
	localStorage.setItem('zero_session:preseeded', 'true')
}

export function clearPreseededFlag(): void {
	if (typeof window === 'undefined') return
	localStorage.removeItem('zero_session:preseeded')
}
