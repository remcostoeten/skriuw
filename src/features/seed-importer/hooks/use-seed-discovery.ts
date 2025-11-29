import { useState, useEffect, useCallback } from 'react'
import { getCachedSeeds, refreshSeedCache, searchSeeds, filterSeedsBySource, clearSeedCache } from '../utils/seed-discovery'
import type { ParsedSeed, SeedSource } from '../api/types'

interface UseSeedDiscoveryOptions {
  enabled?: boolean
}

export function useSeedDiscovery(options: UseSeedDiscoveryOptions = {}) {
  const { enabled = true } = options
  const [seeds, setSeeds] = useState<ParsedSeed[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<SeedSource | 'all'>('all')

  const loadSeeds = useCallback(async (refresh = false) => {
    if (!enabled) return
    
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
  }, [enabled])

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
    if (!enabled) return
    
    let cancelled = false
    
    loadSeeds().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to discover seeds')
        setLoading(false)
      }
    })
    
    return () => {
      cancelled = true
    }
  }, [loadSeeds, enabled])

  // Clear cache on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Clear cache when component unmounts to free memory
      clearSeedCache()
    }
  }, [])

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