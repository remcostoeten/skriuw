import { useState, useEffect, useCallback } from 'react'
import { getCachedSeeds, refreshSeedCache, searchSeeds, filterSeedsBySource } from '../utils/seed-discovery'
import type { ParsedSeed, SeedSource } from '../api/types'

export function useSeedDiscovery() {
  const [seeds, setSeeds] = useState<ParsedSeed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<SeedSource | 'all'>('all')

  const loadSeeds = useCallback(async (refresh = false) => {
    try {
      setLoading(true)
      setError(null)

      const discoveredSeeds = refresh
        ? await refreshSeedCache()
        : await getCachedSeeds()

      setSeeds(discoveredSeeds)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover seeds')
    } finally {
      setLoading(false)
    }
  }, [])

  const filteredSeeds = useCallback(() => {
    let filtered = seeds

    // Filter by source
    if (selectedSource !== 'all') {
      filtered = filterSeedsBySource(filtered, selectedSource)
    }

    // Apply search
    if (searchQuery.trim()) {
      filtered = searchSeeds(filtered, searchQuery)
    }

    return filtered
  }, [seeds, selectedSource, searchQuery])

  useEffect(() => {
    loadSeeds()
  }, [loadSeeds])

  return {
    seeds,
    filteredSeeds: filteredSeeds(),
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedSource,
    setSelectedSource,
    refresh: () => loadSeeds(true),
    reload: () => loadSeeds(false),
  }
}