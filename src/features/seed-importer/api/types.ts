import type { DefaultNote, DefaultFolder } from '@/features/notes/utils/initialize-defaults'
import type { Note, Folder, Item } from '@/features/notes/types'

export type SeedSource = 'defaults' | 'generated'

export interface SeedMetadata {
  name: string
  source: SeedSource
  description?: string
  version?: string
  filePath: string
  category?: string
}

export interface ParsedSeed {
  metadata: SeedMetadata
  notes: DefaultNote[]
  folders: DefaultFolder[]
}

export interface ImportResult {
  success: boolean
  imported: {
    notes: Note[]
    folders: Folder[]
  }
  skipped: {
    notes: string[]
    folders: string[]
  }
  errors: string[]
}

export interface ImportError {
  type: 'validation' | 'duplicate' | 'storage' | 'unknown'
  message: string
  item?: string
  originalError?: Error
}

export interface ImportProgress {
  current: number
  total: number
  stage: 'validating' | 'creating-folders' | 'creating-notes' | 'complete'
  currentItem?: string
}

export type ImportStatus = 'idle' | 'validating' | 'importing' | 'complete' | 'error'

export interface SeedImportState {
  status: ImportStatus
  progress: ImportProgress
  result: ImportResult | null
  error: ImportError | null
}

export interface SeedImportOptions {
  skipDuplicates?: boolean
  overwriteDuplicates?: boolean
  createFolders?: boolean
  dryRun?: boolean
}