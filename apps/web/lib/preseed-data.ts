import type { Note, Folder, Item } from '@/features/notes/types'

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

export function fileTreeBlock(content: string, style: 'full' | 'card' | 'minimal' = 'full') {
	return {
		id: createId('tree'),
		type: 'fileTree' as const,
		props: {
			style,
			content,
			showIndentLines: true,
			initialExpandedAll: true
		},
		content: [],
		children: []
	}
}

// ============================================================================
// Note Content
// ============================================================================

const WELCOME_CONTENT = [
	heading(1, 'Rich Text Editor Showcase'),
	paragraph(
		'Experience powerful block-based editing with comprehensive formatting options and intuitive controls.'
	),
	paragraph(''),
	heading(2, 'Text Formatting'),
	paragraph('Apply formatting with keyboard shortcuts:', { bold: true }),
	bulletItem('Bold text for emphasis — Ctrl+B or **text**'),
	bulletItem('Italic text for style — Ctrl+I or *text*'),
	bulletItem('Underline for highlights — Ctrl+U'),
	bulletItem('Strikethrough for edits — ~~text~~'),
	bulletItem('Inline code blocks — `code here`'),
	paragraph(''),
	heading(2, 'Content Structure'),
	paragraph('Organize your thoughts with flexible block types:'),
	paragraph(''),
	heading(3, 'Headings'),
	paragraph('Three levels of headings help structure your document hierarchy.'),
	paragraph(''),
	heading(3, 'Lists'),
	paragraph('Create organized lists in multiple formats:'),
	bulletItem('Unordered bullet lists for items'),
	bulletItem('Nested list support for hierarchy'),
	bulletItem('Drag and drop to reorder'),
	paragraph(''),
	paragraph('Numbered lists for sequential content:'),
	numberedItem('First item in sequence'),
	numberedItem('Second item follows naturally'),
	numberedItem('Third completes the progression'),
	paragraph(''),
	heading(2, 'Advanced Features'),
	codeBlock(
		`// Syntax-highlighted code blocks
function example() {
  const editor = useBlockNote();
  return editor.document;
}`,
		'javascript'
	),
	paragraph(''),
	paragraph(
		'Type / anywhere to access the slash command menu and explore all available block types.'
	),
	paragraph(''),
	heading(2, 'Quick Actions'),
	bulletItem('Ctrl+N — Create new note'),
	bulletItem('Ctrl+S — Save current note'),
	bulletItem('Ctrl+/ — View all shortcuts'),
	bulletItem('/ — Open block menu'),
	paragraph(''),
	paragraph('Start writing to experience the fluidity of block-based editing.')
]

const SHORTCUTS_CONTENT = [
	heading(1, 'Keyboard Shortcuts'),
	paragraph(
		'Master Skriuw with these keyboard shortcuts. All shortcuts are customizable in Settings.'
	),
	paragraph(''),
	heading(2, 'General'),
	bulletItem('Ctrl+P / Cmd+K — Open Command Palette'),
	bulletItem('Ctrl+N — New Note'),
	bulletItem('Ctrl+F — New Folder'),
	bulletItem('Ctrl+S — Save Note'),
	bulletItem('Ctrl+, — Open Settings'),
	bulletItem('Ctrl+/ — Show All Shortcuts'),
	paragraph(''),
	heading(2, 'Navigation'),
	bulletItem('Ctrl+B — Toggle Sidebar'),
	bulletItem('Alt+T — Toggle Theme'),
	bulletItem('/ — Focus Editor'),
	bulletItem('Escape — Clear Focus'),
	paragraph(''),
	heading(2, 'Split View'),
	bulletItem('Ctrl+\\ — Toggle Split View'),
	bulletItem('Shift+Ctrl+\\ — Swap Panes'),
	bulletItem('Ctrl+Alt+V — Vertical Split'),
	bulletItem('Ctrl+Alt+H — Horizontal Split'),
	bulletItem('Ctrl+Alt+← / → — Focus Left/Right Pane'),
	bulletItem('Ctrl+Alt+W — Close Active Pane'),
	paragraph(''),
	heading(2, 'Editor'),
	bulletItem('/ — Open Slash Menu'),
	bulletItem('Ctrl+B — Bold'),
	bulletItem('Ctrl+I — Italic'),
	bulletItem('Ctrl+U — Underline'),
	bulletItem('Ctrl+Z — Undo'),
	bulletItem('Ctrl+Shift+Z — Redo'),
	paragraph(''),
	heading(2, 'Sidebar'),
	bulletItem('Enter — Open Note'),
	bulletItem('Delete — Delete Item'),
	bulletItem('Ctrl+Click — Multi-select'),
	bulletItem('Shift+Click — Range Select'),
	bulletItem('Arrow Keys — Navigate Items')
]

const EDITOR_FEATURES_CONTENT = [
	heading(1, 'Editor Features'),
	paragraph('Skriuw uses a powerful block-based editor with rich formatting options.'),
	paragraph(''),
	heading(2, 'Block Types'),
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
	heading(2, 'Formatting'),
	bulletItem('Bold — Ctrl+B or **text**'),
	bulletItem('Italic — Ctrl+I or *text*'),
	bulletItem('Underline — Ctrl+U'),
	bulletItem('Strikethrough — ~~text~~'),
	bulletItem('Code — `inline code`'),
	bulletItem('Links — Ctrl+K or [text](url)'),
	paragraph(''),
	heading(2, 'Mentions & Links'),
	bulletItem('Type @ to mention another note'),
	bulletItem('Mentions create navigable links between notes'),
	bulletItem('Build your personal knowledge graph'),
	paragraph(''),
	heading(2, 'Auto-Save'),
	paragraph('Your notes are automatically saved as you type. No need to manually save!')
]

const ARCHITECTURE_CONTENT = [
	heading(1, 'Architecture Overview'),
	paragraph(
		'Skriuw is built with modern web technologies for maximum performance and developer experience.'
	),
	paragraph(''),
	heading(2, 'Technology Stack'),
	bulletItem('Next.js 15 — React framework with App Router'),
	bulletItem('React 18 — UI library with Server Components'),
	bulletItem('TypeScript — Type-safe development'),
	bulletItem('PostgreSQL + Drizzle ORM — Database layer'),
	bulletItem('BlockNote — Rich text editor'),
	bulletItem('Tailwind CSS — Utility-first styling'),
	bulletItem('Framer Motion — Smooth animations'),
	paragraph(''),
	heading(2, 'Data Flow'),
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
	heading(2, 'Key Directories'),
	bulletItem('app/ — Next.js pages and API routes'),
	bulletItem('features/ — Feature-based modules'),
	bulletItem('components/ — Shared UI components'),
	bulletItem('lib/ — Utilities and configurations'),
	paragraph(''),
	heading(2, 'Deployment'),
	bulletItem('Platform: Vercel'),
	bulletItem('Database: Neon (serverless PostgreSQL)'),
	bulletItem('Desktop: Tauri (optional)')
]

const BACKUP_CONTENT = [
	heading(1, 'Storage & Backup'),
	paragraph('Keep your notes safe with cloud backup integration.'),
	paragraph(''),
	heading(2, 'Backup Providers'),
	bulletItem('Google Drive — Sync notes to your Google account'),
	bulletItem('Dropbox — Backup to Dropbox app folder'),
	bulletItem('Local Storage — For desktop (Tauri) users'),
	paragraph(''),
	heading(2, 'Security'),
	bulletItem('All connections use OAuth2 authentication'),
	bulletItem('Sensitive tokens are encrypted at rest'),
	bulletItem('App-only folder access (cannot read other files)'),
	paragraph(''),
	heading(2, 'Setup'),
	numberedItem('Go to Settings → Backup'),
	numberedItem('Click "Connect" for your preferred provider'),
	numberedItem('Authorize access to your account'),
	numberedItem('Enable automatic backups or sync manually'),
	paragraph(''),
	heading(2, 'Coming Soon'),
	bulletItem('Automated background backups'),
	bulletItem('Version history for backups'),
	bulletItem('One-click restore')
]

const WIKILINKS_CONTENT = [
	heading(1, 'Wikilinks & Backlinks'),
	paragraph(
		'Connect your notes together with bi-directional linking, just like Obsidian or Roam.'
	),
	paragraph(''),
	heading(2, 'Creating Wikilinks'),
	bulletItem('Type [ to open the link suggestion menu'),
	bulletItem('Search for an existing note or create a new one'),
	bulletItem('Links render as [[Note Name]] chips in the editor'),
	bulletItem('Click any wikilink to navigate instantly'),
	paragraph(''),
	heading(2, 'Backlinks Panel'),
	paragraph("At the bottom of every note, you'll see:"),
	bulletItem('Linked References — Notes that explicitly link to this page'),
	bulletItem("Unlinked Mentions — Notes that mention this page's name without linking"),
	bulletItem('Click the chain icon to convert mentions into wikilinks'),
	paragraph(''),
	heading(2, 'Features'),
	bulletItem('Autocomplete — Fuzzy search across all your notes'),
	bulletItem("Create on click — Link to notes that don't exist yet"),
	bulletItem('Context preview — See surrounding text in backlinks'),
	bulletItem('Keyboard accessible — Tab + Enter navigation'),
	paragraph(''),
	heading(2, 'Tips'),
	bulletItem('Use wikilinks to build a knowledge graph'),
	bulletItem('Check unlinked mentions to discover hidden connections'),
	bulletItem('Organize thoughts associatively, not just hierarchically')
]

const FILE_TREE_DEMO_CONTENT = [
	heading(1, 'Interactive File Tree Demo'),
	paragraph(
		'This note demonstrates the interactive file tree block. You can browse files, view code with syntax highlighting, and configure the structure.'
	),
	paragraph(''),
	fileTreeBlock(
		JSON.stringify({
			name: 'Skriuw Demo',
			version: '1.0.0',
			showIndentLines: true,
			enableHoverHighlight: true,
			files: [
				{
					path: 'src/components/Header.tsx',
					content:
						'import { Logo } from \'./Logo\';\n\nexport function Header() {\n  return (\n    <header className="flex items-center justify-between p-4">\n      <Logo />\n      <nav>\n        <a href="/">Home</a>\n        <a href="/about">About</a>\n      </nav>\n    </header>\n  );\n}',
					language: 'tsx'
				},
				{
					path: 'src/utils/api.ts',
					content:
						"export async function fetchData(url: string) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error('Failed to fetch');\n  return response.json();\n}",
					language: 'typescript'
				},
				{
					path: 'public/manifest.json',
					content:
						'{\n  "name": "Skriuw App",\n  "short_name": "Skriuw",\n  "start_url": "/",\n  "display": "standalone"\n}',
					language: 'json'
				},
				{
					path: 'README.md',
					content:
						'# Skriuw Demo Project\n\nThis is a sample project structure to demonstrate the file tree capabilities.\n\n## Features\n- **Syntax Highlighting**: View code files with proper coloring\n- **Collapsible Folders**: Organize complex hierarchies\n- **Resizable Panels**: Adjust the view to your needs',
					language: 'markdown'
				}
			]
		}),
		'full'
	),
	paragraph(''),
	heading(2, 'How to use'),
	bulletItem('Click folders to expand/collapse'),
	bulletItem('Click files to view their content'),
	bulletItem('Hover over the block to see configuration options'),
	bulletItem('Use the gear icon to edit the tree structure')
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
	{ name: 'Rich Text Editor Showcase', content: WELCOME_CONTENT, pinned: true },
	{ name: 'Keyboard Shortcuts', content: SHORTCUTS_CONTENT, folder: 'Getting Started' },
	{ name: 'Editor Features', content: EDITOR_FEATURES_CONTENT, folder: 'Getting Started' },
	{ name: 'Architecture Overview', content: ARCHITECTURE_CONTENT, folder: 'Documentation' },
	{ name: 'Storage & Backup', content: BACKUP_CONTENT, folder: 'Documentation' },
	{ name: 'Wikilinks & Backlinks', content: WIKILINKS_CONTENT, folder: 'Documentation' },
	{ name: 'Interactive File Tree', content: FILE_TREE_DEMO_CONTENT, folder: 'Documentation' },
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
