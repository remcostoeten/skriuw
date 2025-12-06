import { createFolder } from '../api/mutations/create-folder'
import { createNote } from '../api/mutations/create-note'
import { updateNote } from '../api/mutations/update-note'
import { getItems } from '../api/queries/get-items'
import {
	welcomeSeed,
	toDoFolderSeed,
	servoFolderSeed,
	releasesFolderSeed,
	developmentDocsFolderSeed,
	installNoteSeed,
	localUsageNoteSeed,
	taskInEditorNoteSeed,
	vimKeybindingsNoteSeed,
	fontSettingsNoteSeed,
	pinAndFavoriteItemsNoteSeed,
	multiSelectBulkOperationsNoteSeed,
	shiftClickRangeSelectionNoteSeed,
	releaseNote20251125Seed,
	releaseNote20251205Seed,
	architectureOverviewSeed,
	crudLayerOverviewSeed,
	genericStorageFactorySeed,
	serverlessApiAdapterSeed,
	storageSystemOverviewSeed,
} from '../seeds/defaults'

// Lazy import to avoid circular dependency during module evaluation

import type { Folder, Note, Item } from '../types'

/**
 * Default notes and folders to create for each visitor
 * These will be created if no items exist in storage
 */
export type DefaultNote = {
	name: string
	content?: any[] // Block[] - using any to avoid @blocknote/core import dependency
	contentMarkdown?: string
	parentFolderName?: string // Reference folder by name (will be resolved to ID)
}

export type DefaultFolder = {
	name: string
	parentFolderName?: string // Reference parent folder by name (will be resolved to ID)
}

/**
 * Default notes and folders to create for each visitor
 * These will be created if no items exist in storage
 */
const DEFAULT_NOTES: DefaultNote[] = [
	welcomeSeed,
	architectureOverviewSeed,
	crudLayerOverviewSeed,
	genericStorageFactorySeed,
	serverlessApiAdapterSeed,
	storageSystemOverviewSeed,
	// Add more default notes here
]

const RELEASES_FOLDER_NAME = 'Releases'

/**
 * Find a folder by name in the item tree
 */
function findFolderByName(items: Item[], name: string, parentId?: string): Folder | null {
	for (const item of items) {
		if (item.type === 'folder' && item.name === name) {
			const itemWithParent = item as Folder & { parentFolderId?: string }
			if (parentId === undefined || itemWithParent.parentFolderId === parentId) {
				return item as Folder
			}
		}
		if (item.type === 'folder' && item.children) {
			const found = findFolderByName(item.children, name, parentId)
			if (found) return found
		}
	}
	return null
}

/**
 * Find a note by name in the item tree
 */
function findNoteByName(items: Item[], name: string, parentId?: string): Note | null {
	for (const item of items) {
		if (item.type === 'note' && item.name === name) {
			const itemWithParent = item as Note & { parentFolderId?: string }
			if (parentId === undefined || itemWithParent.parentFolderId === parentId) {
				return item as Note
			}
		}
		if (item.type === 'folder' && item.children) {
			const found = findNoteByName(item.children, name, parentId)
			if (found) return found
		}
	}
	return null
}

/**
 * Ensure the "To Do" folder structure exists
 * This creates the structure if it doesn't exist, making it available for everyone
 */
async function ensureToDoFolderStructure(): Promise<void> {
	try {
		const items = await getItems()

		// Find or create "To Do" folder
		let toDoFolder = findFolderByName(items, toDoFolderSeed.name)
		if (!toDoFolder) {
			toDoFolder = await createFolder({ name: toDoFolderSeed.name })
			console.info('Created "To Do" folder')
		}

		const itemsAfterToDo = await getItems()
		let servoFolder = findFolderByName(itemsAfterToDo, servoFolderSeed.name, toDoFolder.id)
		if (!servoFolder) {
			servoFolder = await createFolder({
				name: servoFolderSeed.name,
				parentFolderId: toDoFolder.id,
			})
			console.info('Created "servo" folder inside "To Do"')
		}

		const itemsAfterServo = await getItems()
		const installNote = findNoteByName(itemsAfterServo, installNoteSeed.name, servoFolder.id)
		if (!installNote) {
			const installContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(installNoteSeed.contentMarkdown || '')

			await createNote({
				name: installNoteSeed.name,
				content: installContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Install" note in "servo" folder')
		}

		// Find or create "Local usage" note
		const itemsAfterInstall = await getItems()
		const localUsageNote = findNoteByName(
			itemsAfterInstall,
			localUsageNoteSeed.name,
			servoFolder.id
		)
		if (!localUsageNote) {
			const localUsageContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(localUsageNoteSeed.contentMarkdown || '')

			await createNote({
				name: localUsageNoteSeed.name,
				content: localUsageContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Local usage" note in "servo" folder')
		}

		// Find or create "Task in editor" note
		const itemsAfterLocalUsage = await getItems()
		const taskInEditorNote = findNoteByName(
			itemsAfterLocalUsage,
			taskInEditorNoteSeed.name,
			servoFolder.id
		)
		if (!taskInEditorNote) {
			const taskInEditorContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(taskInEditorNoteSeed.contentMarkdown || '')

			await createNote({
				name: taskInEditorNoteSeed.name,
				content: taskInEditorContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Task in editor" note in "servo" folder')
		}

		// Find or create "Vim Keybinding Controls" note
		const itemsAfterTaskInEditor = await getItems()
		const vimKeybindingsNote = findNoteByName(
			itemsAfterTaskInEditor,
			vimKeybindingsNoteSeed.name,
			servoFolder.id
		)
		if (!vimKeybindingsNote) {
			const vimKeybindingsContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(vimKeybindingsNoteSeed.contentMarkdown || '')

			await createNote({
				name: vimKeybindingsNoteSeed.name,
				content: vimKeybindingsContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Vim Keybinding Controls" note in "servo" folder')
		}

		// Find or create "Font Size, Family, and Line Height Settings" note
		const itemsAfterVimKeybindings = await getItems()
		const fontSettingsNote = findNoteByName(
			itemsAfterVimKeybindings,
			fontSettingsNoteSeed.name,
			servoFolder.id
		)
		if (!fontSettingsNote) {
			const fontSettingsContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(fontSettingsNoteSeed.contentMarkdown || '')

			await createNote({
				name: fontSettingsNoteSeed.name,
				content: fontSettingsContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Font Size, Family, and Line Height Settings" note in "servo" folder')
		}

		// Find or create "Pin Items to Top & Favorite Notes" note
		const itemsAfterFontSettings = await getItems()
		const pinAndFavoriteItemsNote = findNoteByName(
			itemsAfterFontSettings,
			pinAndFavoriteItemsNoteSeed.name,
			servoFolder.id
		)
		if (!pinAndFavoriteItemsNote) {
			const pinAndFavoriteItemsContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(pinAndFavoriteItemsNoteSeed.contentMarkdown || '')

			await createNote({
				name: pinAndFavoriteItemsNoteSeed.name,
				content: pinAndFavoriteItemsContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Pin Items to Top & Favorite Notes" note in "servo" folder')
		}

		// Find or create "Multi-Select & Bulk Operations" note
		const itemsAfterPinAndFavorite = await getItems()
		const multiSelectBulkOperationsNote = findNoteByName(
			itemsAfterPinAndFavorite,
			multiSelectBulkOperationsNoteSeed.name,
			servoFolder.id
		)
		if (!multiSelectBulkOperationsNote) {
			const multiSelectBulkOperationsContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(multiSelectBulkOperationsNoteSeed.contentMarkdown || '')

			await createNote({
				name: multiSelectBulkOperationsNoteSeed.name,
				content: multiSelectBulkOperationsContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Multi-Select & Bulk Operations" note in "servo" folder')
		}

		// Find or create "Shift+Click Range Selection" note
		const itemsAfterMultiSelect = await getItems()
		const shiftClickRangeSelectionNote = findNoteByName(
			itemsAfterMultiSelect,
			shiftClickRangeSelectionNoteSeed.name,
			servoFolder.id
		)
		if (!shiftClickRangeSelectionNote) {
			const shiftClickRangeSelectionContent = await (
				await import('./markdown-to-blocks')
			).markdownToBlocks(shiftClickRangeSelectionNoteSeed.contentMarkdown || '')

			await createNote({
				name: shiftClickRangeSelectionNoteSeed.name,
				content: shiftClickRangeSelectionContent,
				parentFolderId: servoFolder.id,
			})
			console.info('Created "Shift+Click Range Selection" note in "servo" folder')
		}
	} catch (error) {
		console.error('Failed to ensure "To Do" folder structure:', error)
		// Don't throw - allow app to continue even if this fails
	}
}

async function ensureReleaseNotes(): Promise<void> {
	try {
		let items = await getItems()
		let releasesFolder = findFolderByName(items, RELEASES_FOLDER_NAME)

		if (!releasesFolder) {
			releasesFolder = await createFolder({ name: RELEASES_FOLDER_NAME })
			console.info('Created "Releases" folder')
			items = await getItems()
		}

		// Process release note seeds
		const releaseNoteSeeds = [releaseNote20251125Seed, releaseNote20251205Seed]

		for (const seed of releaseNoteSeeds) {
			const existing = findNoteByName(items, seed.name, releasesFolder.id)
			if (!existing) {
				const content = await (
					await import('./markdown-to-blocks')
				).markdownToBlocks(seed.contentMarkdown || '')
				await createNote({
					name: seed.name,
					content,
					parentFolderId: releasesFolder.id,
				})
				console.info(`Seeded release note "${seed.name}"`)
				// Refresh items after each creation
				items = await getItems()
			}
		}
	} catch (error) {
		console.error('Failed to ensure release notes:', error)
	}
}

const INITIALIZATION_FLAG_KEY = 'skriuw_defaults_initialized'

/**
 * Fix existing Architecture Overview note if it has malformed content
 */
async function fixArchitectureOverviewNote(): Promise<void> {
	try {
		const items = await getItems()
		const existingNote = findNoteByName(items, architectureOverviewSeed.name)

		if (existingNote) {
			// Check if the note content contains malformed code blocks
			const contentStr = JSON.stringify(existingNote.content)
			const hasMalformedCodeBlock =
				contentStr.includes('Frontend Components') &&
				contentStr.includes('hardBreak') &&
				!contentStr.includes('language')

			if (hasMalformedCodeBlock) {
				console.info('Fixing malformed Architecture Overview note content')
				const fixedContent = await (
					await import('./markdown-to-blocks')
				).markdownToBlocks(architectureOverviewSeed.contentMarkdown || '')

				await updateNote(existingNote.id, {
					content: fixedContent,
				})
				console.info('Successfully fixed Architecture Overview note')
			}
		}
	} catch (error) {
		console.error('Failed to fix Architecture Overview note:', error)
		// Don't throw - allow app to continue
	}
}

/**
 * Check if defaults have been initialized (using localStorage for persistence across refreshes)
 */
function hasInitializationFlag(): boolean {
	if (typeof window === 'undefined') return false
	return localStorage.getItem(INITIALIZATION_FLAG_KEY) === 'true'
}

/**
 * Set the initialization flag to prevent re-initialization on page refresh
 */
function setInitializationFlag(): void {
	if (typeof window === 'undefined') return
	localStorage.setItem(INITIALIZATION_FLAG_KEY, 'true')
}

/**
 * Clear the initialization flag (for testing/reset purposes)
 * This allows defaults to be re-initialized on next page load
 */
export function clearInitializationFlag(): void {
	if (typeof window === 'undefined') return
	localStorage.removeItem(INITIALIZATION_FLAG_KEY)
}

/**
 * Initialize default notes and folders for a new visitor
 * Only creates defaults if no items exist in storage and initialization hasn't been done before
 * Uses localStorage flag to prevent re-initialization on page refresh (similar to splash screen)
 */
export async function initializeDefaultNotesAndFolders(): Promise<void> {
	try {
		// Fast check: skip if we've already initialized (persists across page refreshes)
		if (hasInitializationFlag()) {
			console.info('Defaults already initialized (localStorage flag), skipping')
			return
		}

		const existingItems = await getItems()

		// Only initialize if no items exist (first visit)
		if (existingItems.length === 0) {
			console.info('No items found, initializing default notes and folders...')

			// Create folders first (they might be parents for notes)
			const folderMap = new Map<string, string>() // name -> id

			const folderSeeds: DefaultFolder[] = [
				toDoFolderSeed,
				servoFolderSeed,
				releasesFolderSeed,
				developmentDocsFolderSeed,
			]
			for (const folder of folderSeeds) {
				// Resolve parent folder ID if parentFolderName is specified
				const parentFolderId = folder.parentFolderName
					? folderMap.get(folder.parentFolderName)
					: undefined

				const createdFolder = await createFolder({
					name: folder.name,
					parentFolderId,
				})
				folderMap.set(folder.name, createdFolder.id)
			}

			// Create notes
			for (const note of DEFAULT_NOTES) {
				// Resolve parent folder ID if parentFolderName is specified
				const parentFolderId = note.parentFolderName
					? folderMap.get(note.parentFolderName)
					: undefined

				let contentBlocks = note.content
				if (!contentBlocks && note.contentMarkdown) {
					contentBlocks = await (
						await import('./markdown-to-blocks')
					).markdownToBlocks(note.contentMarkdown)
				}

				await createNote({
					name: note.name,
					content: contentBlocks,
					parentFolderId,
				})
			}

			console.info(
				`Initialized ${[toDoFolderSeed, servoFolderSeed, releasesFolderSeed, developmentDocsFolderSeed].length} folders and ${DEFAULT_NOTES.length} notes`
			)

			// Set flag to prevent re-initialization on page refresh
			setInitializationFlag()
		} else {
			console.info(`Found ${existingItems.length} existing items, skipping default initialization`)

			// Set flag even if items exist (they might have been created manually)
			// This prevents unnecessary DB queries on future page refreshes
			setInitializationFlag()
		}

		// Always ensure the "To Do" folder structure exists
		await ensureToDoFolderStructure()
		await ensureReleaseNotes()

		// Fix existing malformed Architecture Overview note if needed
		await fixArchitectureOverviewNote()
	} catch (error) {
		console.error('Failed to initialize default notes and folders:', error)
		// Don't throw - allow app to continue even if defaults fail
	}
}
