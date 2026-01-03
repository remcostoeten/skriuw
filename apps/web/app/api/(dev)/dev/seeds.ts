// ============================================================================
// Block Helpers - Create BlockNote-compatible blocks
// ============================================================================

let blockIdCounter = 0
function createId(prefix: string): string {
    return `${prefix}-${++blockIdCounter}`
}

function heading(level: 1 | 2 | 3, text: string) {
    return {
        id: createId('h'),
        type: 'heading' as const,
        props: { level, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text' as const, text, styles: {} }],
        children: [],
    }
}

function paragraph(text: string, styles: Record<string, boolean> = {}) {
    return {
        id: createId('p'),
        type: 'paragraph' as const,
        props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
        content: text ? [{ type: 'text' as const, text, styles }] : [],
        children: [],
    }
}

function bulletItem(text: string) {
    return {
        id: createId('li'),
        type: 'bulletListItem' as const,
        props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text' as const, text, styles: {} }],
        children: [],
    }
}

function numberedItem(text: string) {
    return {
        id: createId('ni'),
        type: 'numberedListItem' as const,
        props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text' as const, text, styles: {} }],
        children: [],
    }
}

function codeBlock(code: string, language = 'text') {
    return {
        id: createId('code'),
        type: 'codeBlock' as const,
        props: { language },
        content: [{ type: 'text' as const, text: code, styles: {} }],
        children: [],
    }
}

// ============================================================================
// Seed Data
// ============================================================================

export const sampleNotes = [
    {
        name: 'Welcome to Skriuw',
        pinned: true,
        content: [
            heading(1, '👋 Welcome to Skriuw'),
            paragraph('A blazingly fast, privacy-focused note-taking app built with modern web technologies.'),
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
            paragraph('Happy writing! 🎉'),
        ],
    },
    {
        name: 'Keyboard Shortcuts',
        content: [
            heading(1, '⌨️ Keyboard Shortcuts'),
            paragraph('Master Skriuw with these keyboard shortcuts. All shortcuts are customizable in Settings.'),
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
        ],
    },
    {
        name: 'Editor Features',
        content: [
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
        ],
    },
    {
        name: 'Architecture Overview',
        content: [
            heading(1, '🏗️ Architecture Overview'),
            paragraph('Skriuw is built with modern web technologies for maximum performance and developer experience.'),
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
        ],
    },
    {
        name: 'Storage & Backup',
        content: [
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
        ],
    },
]

export const sampleFolders = [
    { name: 'Getting Started', children: ['Keyboard Shortcuts', 'Editor Features'] },
    { name: 'Documentation', children: ['Architecture Overview', 'Storage & Backup'] },
    { name: 'Personal' },
    { name: 'Work', children: ['Project Ideas', 'Meeting Notes'] },
    { name: 'Archive' },
]

