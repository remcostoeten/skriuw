import type { Item, Note, Folder } from '@/features/notes/types'
import { blocksToMarkdown } from '@/features/notes/utils/blocks-to-markdown'

export type ExportFormat = 'json' | 'markdown'

export interface ExportOptions {
	format: ExportFormat
    /**
     * Include metadata in the export
     */
    includeMetadata?: boolean
    /**
     * Only export these items
     */
	selectedIds?: string[]
}

export interface SkriuwExportData {
	version: '1.0'
	
    /**
     * When the export was created
     */
    exportedAt: string

    /**
     * The name of the app that created the export
     */
    appName: 'Skriuw'

    /**
     * The items to export
     */
	items: Item[]
    /**
     * Metadata about the export
     */
	metadata?: {
		totalNotes: number
		totalFolders: number
	}
}

/**
 * Count notes and folders recursively
 */
function countItems(items: Item[]): { notes: number; folders: number } {
	let notes = 0
	let folders = 0

	for (const item of items) {
		if (item.type === 'note') {
			notes++
		} else {
			folders++
			const childCounts = countItems(item.children)
			notes += childCounts.notes
			folders += childCounts.folders
		}
	}

	return { notes, folders }
}

/**
 * Filter items to only include selected IDs (and their parent folders)
 */
function filterItems(items: Item[], selectedIds: Set<string>): Item[] {
	const result: Item[] = []

	for (const item of items) {
		if (item.type === 'note') {
			if (selectedIds.has(item.id)) {
				result.push(item)
			}
		} else {
			// For folders, check if folder itself is selected or any children
			const filteredChildren = filterItems(item.children, selectedIds)
			if (selectedIds.has(item.id) || filteredChildren.length > 0) {
				result.push({
					...item,
					children: filteredChildren.length > 0 ? filteredChildren : item.children,
				})
			}
		}
	}

	return result
}

/**
 * Export notes as JSON format
 */
export function exportAsJson(items: Item[], options: ExportOptions = { format: 'json' }): string {
	let exportItems = items

	if (options.selectedIds && options.selectedIds.length > 0) {
		const selectedSet = new Set(options.selectedIds)
		exportItems = filterItems(items, selectedSet)
	}

	const counts = countItems(exportItems)

	const exportData: SkriuwExportData = {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		appName: 'Skriuw',
		items: exportItems,
		metadata: options.includeMetadata !== false ? {
			totalNotes: counts.notes,
			totalFolders: counts.folders,
		} : undefined,
	}

	return JSON.stringify(exportData, null, 2)
}

/**
 * Convert a note to markdown with frontmatter
 */
function noteToMarkdown(note: Note, folderPath: string = ''): { filename: string; content: string } {
	const frontmatter = [
		'---',
		`title: "${note.name.replace(/"/g, '\\"')}"`,
		`id: ${note.id}`,
		`createdAt: ${new Date(note.createdAt).toISOString()}`,
		`updatedAt: ${new Date(note.updatedAt).toISOString()}`,
		note.pinned ? 'pinned: true' : null,
		note.favorite ? 'favorite: true' : null,
		folderPath ? `folder: "${folderPath}"` : null,
		'---',
		'',
	].filter(Boolean).join('\n')

	const markdownContent = blocksToMarkdown(note.content || [])
	const fullContent = frontmatter + markdownContent

	// Create safe filename
	const safeFilename = note.name
		.replace(/[<>:"/\\|?*]/g, '-')
		.replace(/\s+/g, '-')
		.toLowerCase()
		.substring(0, 100)

	const filename = folderPath 
		? `${folderPath}/${safeFilename}.md`
		: `${safeFilename}.md`

	return { filename, content: fullContent }
}

/**
 * Recursively collect all markdown files from items
 */
function collectMarkdownFiles(
	items: Item[],
	folderPath: string = '',
	selectedIds?: Set<string>
): Array<{ filename: string; content: string }> {
	const files: Array<{ filename: string; content: string }> = []

	for (const item of items) {
		if (item.type === 'note') {
			if (!selectedIds || selectedIds.has(item.id)) {
				files.push(noteToMarkdown(item, folderPath))
			}
		} else {
			// Folder
			const shouldIncludeFolder = !selectedIds || selectedIds.has(item.id)
			const newPath = folderPath ? `${folderPath}/${item.name}` : item.name
			
			// Recursively collect from children
			const childFiles = collectMarkdownFiles(
				item.children,
				shouldIncludeFolder ? newPath : folderPath,
				selectedIds
			)
			files.push(...childFiles)
		}
	}

	return files
}

/**
 * Export notes as markdown files (returns array of file objects for zip creation)
 */
export function exportAsMarkdown(
	items: Item[],
	options: ExportOptions = { format: 'markdown' }
): Array<{ filename: string; content: string }> {
	const selectedIds = options.selectedIds 
		? new Set(options.selectedIds)
		: undefined

	return collectMarkdownFiles(items, '', selectedIds)
}

/**
 * Create and download a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

/**
 * Download JSON export
 */
export function downloadJsonExport(items: Item[], options?: Omit<ExportOptions, 'format'>): void {
	const json = exportAsJson(items, { ...options, format: 'json' })
	const timestamp = new Date().toISOString().split('T')[0]
	downloadFile(json, `skriuw-backup-${timestamp}.json`, 'application/json')
}

/**
 * Download markdown export as a single combined file
 * (For zip export, use a library like JSZip)
 */
export function downloadMarkdownExport(items: Item[], options?: Omit<ExportOptions, 'format'>): void {
	const files = exportAsMarkdown(items, { ...options, format: 'markdown' })
	
	// Combine all markdown files into one with separators
	const combined = files.map(f => {
		return `<!-- FILE: ${f.filename} -->\n\n${f.content}`
	}).join('\n\n---\n\n')

	const timestamp = new Date().toISOString().split('T')[0]
	downloadFile(combined, `skriuw-notes-${timestamp}.md`, 'text/markdown')
}

/**
 * Get markdown files for zip creation (to be used with JSZip)
 */
export function getMarkdownFilesForZip(
	items: Item[],
	options?: Omit<ExportOptions, 'format'>
): Array<{ filename: string; content: string }> {
	return exportAsMarkdown(items, { ...options, format: 'markdown' })
}
