import { createNote } from '@/features/notes/api/mutations/create-note'
import { createFolder } from '@/features/notes/api/mutations/create-folder'
import { getItems } from '@/features/notes/api/queries/get-items'
import { markdownToBlocks } from '@/features/notes/utils/markdown-to-blocks'
import type { Note, Folder, Item } from '@/features/notes/types'
import type { DefaultNote, DefaultFolder } from '@/features/notes/utils/initialize-defaults'
import type {
  ParsedSeed,
  ImportResult,
  ImportProgress,
  ImportError,
  SeedImportOptions,
} from '../types'

/**
 * Find a folder by name in the item tree (copied from initialize-defaults)
 */
function findFolderByName(
  items: Item[],
  name: string,
  parentId?: string
): Folder | null {
  for (const item of items) {
    if (item.type === 'folder' && item.name === name) {
      const itemWithParent = item as Folder & { parentFolderId?: string }
      if (
        parentId === undefined ||
        itemWithParent.parentFolderId === parentId
      ) {
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
 * Find a note by name in the item tree (copied from initialize-defaults)
 */
function findNoteByName(
  items: Item[],
  name: string,
  parentId?: string
): Note | null {
  for (const item of items) {
    if (item.type === 'note' && item.name === name) {
      const itemWithParent = item as Note & { parentFolderId?: string }
      if (
        parentId === undefined ||
        itemWithParent.parentFolderId === parentId
      ) {
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
 * Create folders and build a name-to-id mapping
 */
async function createFoldersWithMapping(
  folders: DefaultFolder[],
  existingItems: Item[],
  options: SeedImportOptions
): Promise<{ folders: Folder[]; folderMap: Map<string, string> }> {
  const createdFolders: Folder[] = []
  const folderMap = new Map<string, string>()

  // First pass: create all top-level folders and build initial mapping
  for (const folder of folders) {
    // Skip if already exists and we're not overwriting
    if (!options.overwriteDuplicates) {
      const existing = findFolderByName(existingItems, folder.name)
      if (existing) {
        folderMap.set(folder.name, existing.id)
        continue
      }
    }

    // Create folder with parent reference
    const parentFolderId = folder.parentFolderName
      ? folderMap.get(folder.parentFolderName)
      : undefined

    try {
      const createdFolder = await createFolder({
        name: folder.name,
        parentFolderId,
      })

      createdFolders.push(createdFolder)
      folderMap.set(folder.name, createdFolder.id)
    } catch (error) {
      console.error(`Failed to create folder "${folder.name}":`, error)
      throw error
    }
  }

  return { folders: createdFolders, folderMap }
}

/**
 * Create notes with the folder mapping
 */
async function createNotesWithMapping(
  notes: DefaultNote[],
  existingItems: Item[],
  folderMap: Map<string, string>,
  options: SeedImportOptions
): Promise<{ notes: Note[]; skippedNotes: string[] }> {
  const createdNotes: Note[] = []
  const skippedNotes: string[] = []

  for (const note of notes) {
    // Check for duplicates
    if (!options.overwriteDuplicates) {
      const parentFolderId = note.parentFolderName
        ? folderMap.get(note.parentFolderName)
        : undefined

      const existing = findNoteByName(existingItems, note.name, parentFolderId)
      if (existing) {
        skippedNotes.push(note.name)
        continue
      }
    }

    try {
      // Resolve parent folder ID
      const parentFolderId = note.parentFolderName
        ? folderMap.get(note.parentFolderName)
        : undefined

      // Prepare content
      let contentBlocks = note.content
      if (!contentBlocks && note.contentMarkdown) {
        contentBlocks = await markdownToBlocks(note.contentMarkdown)
      }

      const createdNote = await createNote({
        name: note.name,
        content: contentBlocks,
        parentFolderId,
      })

      createdNotes.push(createdNote)
    } catch (error) {
      console.error(`Failed to create note "${note.name}":`, error)
      throw error
    }
  }

  return { notes: createdNotes, skippedNotes }
}

/**
 * Import a single seed with progress tracking
 */
export async function importSeed(
  seed: ParsedSeed,
  options: SeedImportOptions = {},
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    imported: { notes: [], folders: [] },
    skipped: { notes: [], folders: [] },
    errors: [],
  }

  try {
    onProgress?.({
      current: 0,
      total: seed.folders.length + seed.notes.length,
      stage: 'validating',
    })

    // Get existing items for duplicate checking
    const existingItems = await getItems()

    // Create folders first
    onProgress?.({
      current: 0,
      total: seed.folders.length + seed.notes.length,
      stage: 'creating-folders',
      currentItem: 'Creating folders...',
    })

    const { folders: createdFolders, folderMap } = await createFoldersWithMapping(
      seed.folders,
      existingItems,
      options
    )

    result.imported.folders = createdFolders

    // Count skipped folders
    for (const folder of seed.folders) {
      if (!createdFolders.find(f => f.name === folder.name)) {
        result.skipped.folders.push(folder.name)
      }
    }

    // Create notes
    onProgress?.({
      current: createdFolders.length,
      total: seed.folders.length + seed.notes.length,
      stage: 'creating-notes',
      currentItem: 'Creating notes...',
    })

    const { notes: createdNotes, skippedNotes } = await createNotesWithMapping(
      seed.notes,
      existingItems,
      folderMap,
      options
    )

    result.imported.notes = createdNotes
    result.skipped.notes = skippedNotes

    onProgress?.({
      current: createdFolders.length + createdNotes.length,
      total: seed.folders.length + seed.notes.length,
      stage: 'complete',
    })

    result.success = true
  } catch (error) {
    result.success = false
    result.errors.push(error instanceof Error ? error.message : String(error))
  }

  return result
}

/**
 * Import multiple seeds
 */
export async function importSeeds(
  seeds: ParsedSeed[],
  options: SeedImportOptions = {},
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  const totalItems = seeds.reduce((total, seed) => total + seed.folders.length + seed.notes.length, 0)

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]
    const result = await importSeed(seed, options, (progress) => {
      onProgress?.({
        ...progress,
        current: i * totalItems / seeds.length + progress.current,
        total: totalItems,
        currentItem: `${seed.metadata.name} - ${progress.currentItem}`,
      })
    })

    results.push(result)
  }

  return results
}