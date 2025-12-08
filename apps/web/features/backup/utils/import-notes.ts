import type { Item, Note, Folder } from '@/features/notes/types'
import { markdownToBlocks } from '@/features/notes/utils/markdown-to-blocks'
import type { SkriuwExportData } from './export-notes'
import { generateId } from '@skriuw/core-logic'

export type ImportFormat = 'json' | 'markdown'

/**
 * The import mode
 */
export type ImportMode = 'merge' | 'replace'

/**
 * The import options
 */
export interface ImportOptions {
	mode: ImportMode
}

/**
 * The import result
 */
export interface ImportResult {
	success: boolean
	importedNotes: number
	importedFolders: number
	errors: string[]
	items?: Item[]
}

/**
 * The parsed markdown note
 */
export interface ParsedMarkdownNote {
	title: string
	content: string
	metadata: {
		id?: string
		createdAt?: string
		updatedAt?: string
		pinned?: boolean
		favorite?: boolean
		folder?: string
	}
}

/**
 * Parse YAML frontmatter from markdown
 */
function parseFrontmatter(markdown: string): { frontmatter: Record<string, any>; content: string } {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/
	const match = markdown.match(frontmatterRegex)

	if (!match) {
		return { frontmatter: {}, content: markdown }
	}

	const frontmatterStr = match[1]
	const content = match[2]

	const frontmatter: Record<string, any> = {}
	const lines = frontmatterStr.split('\n')

	for (const line of lines) {
		const colonIndex = line.indexOf(':')
		if (colonIndex === -1) continue

		const key = line.substring(0, colonIndex).trim()
		let value = line.substring(colonIndex + 1).trim()

		// Remove quotes
		if ((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}

		// Parse booleans
		if (value === 'true') {
			frontmatter[key] = true
		} else if (value === 'false') {
			frontmatter[key] = false
		} else {
			frontmatter[key] = value
		}
	}

	return { frontmatter, content }
}

/**
 * Parse a markdown file into a note structure
 */
function parseMarkdownFile(content: string, filename: string): ParsedMarkdownNote {
	const { frontmatter, content: markdownContent } = parseFrontmatter(content)

	// Extract title from frontmatter or filename
	const title = frontmatter.title ||
		filename.replace(/\.md$/i, '').replace(/-/g, ' ')

	return {
		title,
		content: markdownContent.trim(),
		metadata: {
			id: frontmatter.id,
			createdAt: frontmatter.createdAt,
			updatedAt: frontmatter.updatedAt,
			pinned: frontmatter.pinned,
			favorite: frontmatter.favorite,
			folder: frontmatter.folder,
		},
	}
}

/**
 * Validate Skriuw JSON export format
 */
function validateSkriuwExport(data: any): data is SkriuwExportData {
	return (
		data &&
		typeof data === 'object' &&
		data.appName === 'Skriuw' &&
		data.version === '1.0' &&
		Array.isArray(data.items)
	)
}

/**
 * Validate and sanitize imported items
 */
function sanitizeItems(items: any[]): Item[] {
	const now = Date.now()

	function sanitizeItem(item: any): Item | null {
		if (!item || typeof item !== 'object') return null
		if (!item.id || !item.name || !item.type) return null

		if (item.type === 'note') {
			return {
				id: item.id,
				name: String(item.name),
				type: 'note',
				content: Array.isArray(item.content) ? item.content : [],
				parentFolderId: item.parentFolderId,
				pinned: Boolean(item.pinned),
				pinnedAt: item.pinnedAt,
				favorite: Boolean(item.favorite),
				createdAt: item.createdAt || now,
				updatedAt: item.updatedAt || now,
			} as Note
		}

		if (item.type === 'folder') {
			const children = Array.isArray(item.children)
				? item.children.map(sanitizeItem).filter(Boolean) as Item[]
				: []

			return {
				id: item.id,
				name: String(item.name),
				type: 'folder',
				children,
				parentFolderId: item.parentFolderId,
				pinned: Boolean(item.pinned),
				pinnedAt: item.pinnedAt,
				createdAt: item.createdAt || now,
				updatedAt: item.updatedAt || now,
			} as Folder
		}

		return null
	}

	return items.map(sanitizeItem).filter(Boolean) as Item[]
}

/**
 * Import from Skriuw JSON backup
 */
export async function importFromJson(jsonContent: string): Promise<ImportResult> {
	const errors: string[] = []

	try {
		const data = JSON.parse(jsonContent)

		if (!validateSkriuwExport(data)) {
			return {
				success: false,
				importedNotes: 0,
				importedFolders: 0,
				errors: ['Invalid Skriuw backup format. Please use a valid Skriuw JSON export file.'],
			}
		}

		const items = sanitizeItems(data.items)

		// Count items
		let notes = 0
		let folders = 0
		function countItems(itemList: Item[]) {
			for (const item of itemList) {
				if (item.type === 'note') {
					notes++
				} else {
					folders++
					countItems(item.children)
				}
			}
		}
		countItems(items)

		return {
			success: true,
			importedNotes: notes,
			importedFolders: folders,
			errors,
			items,
		}
	} catch (error) {
		return {
			success: false,
			importedNotes: 0,
			importedFolders: 0,
			errors: [`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
		}
	}
}

/**
 * Import from markdown file(s)
 */
export async function importFromMarkdown(
	files: Array<{ name: string; content: string }>
): Promise<ImportResult> {
	const errors: string[] = []
	const items: Item[] = []
	const folderMap = new Map<string, Folder>()
	const now = Date.now()

	for (const file of files) {
		try {
			const parsed = parseMarkdownFile(file.content, file.name)

			// Convert markdown to blocks
			const blocks = await markdownToBlocks(parsed.content)

			const note: Note = {
				id: parsed.metadata.id || generateId(),
				name: parsed.title,
				type: 'note',
				content: blocks,
				pinned: parsed.metadata.pinned || false,
				favorite: parsed.metadata.favorite || false,
				createdAt: parsed.metadata.createdAt
					? new Date(parsed.metadata.createdAt).getTime()
					: now,
				updatedAt: parsed.metadata.updatedAt
					? new Date(parsed.metadata.updatedAt).getTime()
					: now,
			}

			// Handle folder structure from metadata or file path
			const folderPath = parsed.metadata.folder || extractFolderFromPath(file.name)

			if (folderPath) {
				// Create or get folder
				let folder = folderMap.get(folderPath)
				if (!folder) {
					folder = {
						id: generateId(),
						name: folderPath.split('/').pop() || folderPath,
						type: 'folder',
						children: [],
						createdAt: now,
						updatedAt: now,
					}
					folderMap.set(folderPath, folder)
					items.push(folder)
				}
				note.parentFolderId = folder.id
				folder.children.push(note)
			} else {
				items.push(note)
			}
		} catch (error) {
			errors.push(`Failed to import ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	// Count results
	let noteCount = 0
	let folderCount = folderMap.size

	function countNotes(itemList: Item[]) {
		for (const item of itemList) {
			if (item.type === 'note') {
				noteCount++
			} else {
				countNotes(item.children)
			}
		}
	}
	countNotes(items)

	return {
		success: errors.length === 0,
		importedNotes: noteCount,
		importedFolders: folderCount,
		errors,
		items,
	}
}

/**
 * Extract folder path from file path
 */
function extractFolderFromPath(filepath: string): string | null {
	const parts = filepath.split('/')
	if (parts.length <= 1) return null
	return parts.slice(0, -1).join('/')
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(new Error('Failed to read file'))
		reader.readAsText(file)
	})
}

/**
 * Process uploaded files for import
 */
export async function processImportFiles(files: FileList | File[]): Promise<ImportResult> {
	const fileArray = Array.from(files)

	if (fileArray.length === 0) {
		return {
			success: false,
			importedNotes: 0,
			importedFolders: 0,
			errors: ['No files selected'],
		}
	}

	// Check if it's a JSON file (Skriuw backup)
	const jsonFile = fileArray.find(f => f.name.endsWith('.json'))
	if (jsonFile) {
		const content = await readFileAsText(jsonFile)
		return importFromJson(content)
	}

	// Otherwise, treat as markdown files
	const markdownFiles = fileArray.filter(f =>
		f.name.endsWith('.md') || f.name.endsWith('.markdown')
	)

	if (markdownFiles.length === 0) {
		return {
			success: false,
			importedNotes: 0,
			importedFolders: 0,
			errors: ['No valid files found. Please upload .json or .md files.'],
		}
	}

	const filesWithContent = await Promise.all(
		markdownFiles.map(async (file) => ({
			name: file.name,
			content: await readFileAsText(file),
		}))
	)

	return importFromMarkdown(filesWithContent)
}
