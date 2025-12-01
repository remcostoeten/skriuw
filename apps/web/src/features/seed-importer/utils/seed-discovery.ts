import type { ParsedSeed, SeedSource } from '../api/types'
import { parseSeedModule, validateParsedSeed } from './seed-parser'

// Lazy glob - only initialize when actually needed
let seedModulesCache: Record<string, () => Promise<any>> | null = null

function getSeedModules(): Record<string, () => Promise<any>> {
  if (seedModulesCache) {
    return seedModulesCache
  }
  
  try {
    seedModulesCache = import.meta.glob('../../../features/notes/seeds/**/*.{ts,js}', {
      eager: false,
    }) as Record<string, () => Promise<any>>
    return seedModulesCache
  } catch (globError) {
    console.warn('Failed to use import.meta.glob for seed discovery:', globError)
    return {}
  }
}

/**
 * Discover all seed files using Vite's import.meta.glob
 * Loads seeds in batches to prevent memory issues
 */
export async function discoverSeeds(): Promise<ParsedSeed[]> {
  const seeds: ParsedSeed[] = []

  try {
    // Only get the glob when actually needed
    const seedModules = getSeedModules()
    const moduleEntries = Object.entries(seedModules)
    
    // Limit total number of seeds to prevent memory issues
    const MAX_SEEDS = 50
    if (moduleEntries.length > MAX_SEEDS) {
      console.warn(`Too many seed files (${moduleEntries.length}), limiting to ${MAX_SEEDS}`)
    }
    
    const BATCH_SIZE = 3 // Reduced batch size to prevent memory issues
    const entriesToProcess = moduleEntries.slice(0, MAX_SEEDS)
    
    // Load modules in batches instead of all at once
    for (let i = 0; i < entriesToProcess.length; i += BATCH_SIZE) {
      const batch = entriesToProcess.slice(i, i + BATCH_SIZE)
      
      const batchResults = await Promise.all(
        batch.map(async ([filePath, moduleLoader]) => {
          try {
            const module = await (moduleLoader as () => Promise<any>)()
            return [filePath, module] as const
          } catch (err) {
            console.error(`Failed to load seed module ${filePath}:`, err)
            return null
          }
        })
      )
      
      const validBatchModules = batchResults.filter(Boolean) as [string, any][]

      for (const [filePath, module] of validBatchModules) {
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
    }
  } catch (error) {
    console.error('Failed to discover seeds:', error)
    // Return empty array instead of throwing to prevent app crashes
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
 * Clear the seed cache to free memory
 */
export function clearSeedCache(): void {
  cachedSeeds = null
  cacheTimestamp = 0
  // Also clear the glob cache to free memory
  seedModulesCache = null
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