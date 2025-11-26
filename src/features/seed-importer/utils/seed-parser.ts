import { z } from 'zod'

import type { ParsedSeed, SeedMetadata, SeedSource } from '../api/types'
import type { DefaultNote, DefaultFolder } from '@/features/notes/utils/initialize-defaults'

// Zod schema for validating seed structure
const DefaultNoteSchema = z.object({
  name: z.string(),
  content: z.array(z.any()).optional(),
  contentMarkdown: z.string().optional(),
  parentFolderName: z.string().optional(),
})

const DefaultFolderSchema = z.object({
  name: z.string(),
  parentFolderName: z.string().optional(),
})

const SeedModuleSchema = z.object({
  default: z.union([DefaultNoteSchema, DefaultFolderSchema]).optional(),
}).passthrough()

/**
 * Extract seed metadata from file path
 */
function extractMetadataFromPath(filePath: string, source: SeedSource): SeedMetadata {
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1]?.replace(/\.(ts|js)$/, '') || ''

  // Extract category from directory structure
  const category = parts.length > 2 ? parts[parts.length - 2] : undefined

  return {
    name: fileName,
    source,
    filePath,
    category,
    description: `Seed from ${category || fileName}`,
  }
}

/**
 * Parse a single seed export
 */
function parseSeedExport(
  exportName: string,
  exportValue: unknown,
  metadata: SeedMetadata
): DefaultNote | DefaultFolder | null {
  try {
    // Validate using Zod schema
    const validated = SeedModuleSchema.parse({ default: exportValue })

    if (validated.default) {
      const seed = validated.default as DefaultNote | DefaultFolder

      // Add metadata to the seed for better identification
      return {
        ...seed,
        // Ensure we have a name derived from the export if not provided
        name: seed.name || exportName,
      }
    }

    return null
  } catch (error) {
    console.warn(`Failed to parse seed export ${exportName}:`, error)
    return null
  }
}

/**
 * Parse a seed module and extract all seed exports
 */
export function parseSeedModule(
  module: any,
  filePath: string,
  source: SeedSource
): ParsedSeed {
  const metadata = extractMetadataFromPath(filePath, source)
  const notes: DefaultNote[] = []
  const folders: DefaultFolder[] = []

  // Check for default export
  if (module.default) {
    const seed = parseSeedExport('default', module.default, metadata)
    if (seed) {
      if ('content' in seed || 'contentMarkdown' in seed) {
        notes.push(seed as DefaultNote)
      } else {
        folders.push(seed as DefaultFolder)
      }
    }
  }

  // Check for named exports (look for patterns like *Seed)
  Object.entries(module).forEach(([exportName, exportValue]) => {
    if (exportName === 'default') return

    // Skip imports and non-seed exports
    if (typeof exportValue !== 'object' || exportValue === null) return

    const seed = parseSeedExport(exportName, exportValue, {
      ...metadata,
      name: exportName.replace(/Seed$/, ''), // Remove 'Seed' suffix for cleaner names
    })

    if (seed) {
      if ('content' in seed || 'contentMarkdown' in seed) {
        notes.push(seed as DefaultNote)
      } else {
        folders.push(seed as DefaultFolder)
      }
    }
  })

  return {
    metadata: {
      ...metadata,
      description: `${notes.length} notes, ${folders.length} folders`,
    },
    notes,
    folders,
  }
}

/**
 * Validate a parsed seed
 */
export function validateParsedSeed(seed: ParsedSeed): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!seed.notes.length && !seed.folders.length) {
    errors.push('Seed contains no notes or folders')
  }

  // Check for duplicate names within the seed
  const allNames = [
    ...seed.notes.map(note => note.name),
    ...seed.folders.map(folder => folder.name),
  ]

  const duplicates = allNames.filter((name, index) => allNames.indexOf(name) !== index)
  if (duplicates.length > 0) {
    errors.push(`Duplicate names within seed: ${duplicates.join(', ')}`)
  }

  // Validate note structure
  seed.notes.forEach((note, index) => {
    if (!note.name) {
      errors.push(`Note at index ${index} has no name`)
    }
    if (!note.content && !note.contentMarkdown) {
      errors.push(`Note "${note.name}" has no content`)
    }
  })

  // Validate folder structure
  seed.folders.forEach((folder, index) => {
    if (!folder.name) {
      errors.push(`Folder at index ${index} has no name`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Group seeds by category and source
 */
export function groupSeedsByCategory(seeds: ParsedSeed[]): Record<string, ParsedSeed[]> {
  return seeds.reduce((groups, seed) => {
    const key = `${seed.metadata.source}/${seed.metadata.category || 'uncategorized'}`
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(seed)
    return groups
  }, {} as Record<string, ParsedSeed[]>)
}