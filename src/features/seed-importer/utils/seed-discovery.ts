import type { ParsedSeed, SeedSource } from '../api/types'
import { parseSeedModule, validateParsedSeed } from './seed-parser'

/**
 * Discover all seed files using Vite's import.meta.glob
 */
export async function discoverSeeds(): Promise<ParsedSeed[]> {
  const seeds: ParsedSeed[] = []

  try {
    // Discover all TypeScript and JavaScript files in the seeds directory
    const seedModules = import.meta.glob('../../../features/notes/seeds/**/*.{ts,js}', {
      eager: true,
      query: { raw: true },
    })

    for (const [filePath, module] of Object.entries(seedModules)) {
      try {
        const source = filePath.includes('/defaults/') ? 'defaults' : 'generated'
        const parsedSeed = parseSeedModule(module, filePath, source)

        // Validate the parsed seed
        const validation = validateParsedSeed(parsedSeed)
        if (!validation.valid) {
          console.warn(`Invalid seed ${filePath}:`, validation.errors)
          continue
        }

        seeds.push(parsedSeed)
      } catch (error) {
        console.error(`Failed to parse seed module ${filePath}:`, error)
      }
    }
  } catch (error) {
    console.error('Failed to discover seeds:', error)
  }

  return seeds
}

/**
 * Cache discovered seeds to avoid repeated scanning
 */
let cachedSeeds: ParsedSeed[] | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function getCachedSeeds(): Promise<ParsedSeed[]> {
  const now = Date.now()

  if (cachedSeeds && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedSeeds
  }

  cachedSeeds = await discoverSeeds()
  cacheTimestamp = now

  return cachedSeeds
}

/**
 * Force refresh the seed cache
 */
export async function refreshSeedCache(): Promise<ParsedSeed[]> {
  cachedSeeds = null
  return getCachedSeeds()
}

/**
 * Filter seeds by source
 */
export function filterSeedsBySource(seeds: ParsedSeed[], source: SeedSource): ParsedSeed[] {
  return seeds.filter(seed => seed.metadata.source === source)
}

/**
 * Search seeds by name or description
 */
export function searchSeeds(seeds: ParsedSeed[], query: string): ParsedSeed[] {
  if (!query.trim()) return seeds

  const lowercaseQuery = query.toLowerCase()

  return seeds.filter(seed =>
    seed.metadata.name.toLowerCase().includes(lowercaseQuery) ||
    seed.metadata.description?.toLowerCase().includes(lowercaseQuery) ||
    seed.metadata.category?.toLowerCase().includes(lowercaseQuery) ||
    seed.notes.some(note => note.name.toLowerCase().includes(lowercaseQuery)) ||
    seed.folders.some(folder => folder.name.toLowerCase().includes(lowercaseQuery))
  )
}

/**
 * Get unique categories from seeds
 */
export function getSeedCategories(seeds: ParsedSeed[]): string[] {
  const categories = new Set<string>()

  seeds.forEach(seed => {
    if (seed.metadata.category) {
      categories.add(seed.metadata.category)
    }
  })

  return Array.from(categories).sort()
}

/**
 * Get seed statistics
 */
export function getSeedStats(seeds: ParsedSeed[]) {
  const stats = {
    totalSeeds: seeds.length,
    totalNotes: 0,
    totalFolders: 0,
    bySource: {
      defaults: 0,
      generated: 0,
    },
    byCategory: {} as Record<string, number>,
  }

  seeds.forEach(seed => {
    stats.totalNotes += seed.notes.length
    stats.totalFolders += seed.folders.length
    stats.bySource[seed.metadata.source]++

    const category = seed.metadata.category || 'uncategorized'
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1
  })

  return stats
}