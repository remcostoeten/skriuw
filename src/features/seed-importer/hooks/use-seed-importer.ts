import { useState, useCallback } from 'react'
import { importSeed, importSeeds } from '../api/mutations/import-seed'
import type {
  ParsedSeed,
  SeedImportState,
  ImportProgress,
  ImportResult,
  SeedImportOptions,
  ImportError,
} from '../api/types'

export function useSeedImporter() {
  const [state, setState] = useState<SeedImportState>({
    status: 'idle',
    progress: {
      current: 0,
      total: 0,
      stage: 'validating',
    },
    result: null,
    error: null,
  })

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: {
        current: 0,
        total: 0,
        stage: 'validating',
      },
      result: null,
      error: null,
    })
  }, [])

  const updateProgress = useCallback((progress: ImportProgress) => {
    setState(prev => ({
      ...prev,
      progress,
    }))
  }, [])

  const importSingleSeed = useCallback(async (
    seed: ParsedSeed,
    options: SeedImportOptions = {}
  ) => {
    setState(prev => ({
      ...prev,
      status: 'validating',
      error: null,
      result: null,
    }))

    try {
      const result = await importSeed(seed, options, updateProgress)

      setState({
        status: 'complete',
        progress: {
          current: result.imported.notes.length + result.imported.folders.length,
          total: seed.folders.length + seed.notes.length,
          stage: 'complete',
        },
        result,
        error: null,
      })

      return result
    } catch (error) {
      const importError: ImportError = {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'Import failed',
        originalError: error instanceof Error ? error : undefined,
      }

      setState({
        status: 'error',
        progress: {
          current: 0,
          total: seed.folders.length + seed.notes.length,
          stage: 'validating',
        },
        result: null,
        error: importError,
      })

      throw importError
    }
  }, [updateProgress])

  const importMultipleSeeds = useCallback(async (
    seeds: ParsedSeed[],
    options: SeedImportOptions = {}
  ) => {
    setState(prev => ({
      ...prev,
      status: 'validating',
      error: null,
      result: null,
    }))

    try {
      const results = await importSeeds(seeds, options, updateProgress)

      // Combine all results
      const combinedResult = results.reduce(
        (combined, result) => ({
          success: combined.success && result.success,
          imported: {
            notes: [...combined.imported.notes, ...result.imported.notes],
            folders: [...combined.imported.folders, ...result.imported.folders],
          },
          skipped: {
            notes: [...combined.skipped.notes, ...result.skipped.notes],
            folders: [...combined.skipped.folders, ...result.skipped.folders],
          },
          errors: [...combined.errors, ...result.errors],
        }),
        {
          success: true,
          imported: { notes: [], folders: [] },
          skipped: { notes: [], folders: [] },
          errors: [],
        }
      )

      const totalItems = seeds.reduce((total, seed) => total + seed.folders.length + seed.notes.length, 0)
      const importedItems = combinedResult.imported.notes.length + combinedResult.imported.folders.length

      setState({
        status: 'complete',
        progress: {
          current: importedItems,
          total: totalItems,
          stage: 'complete',
        },
        result: combinedResult,
        error: null,
      })

      return combinedResult
    } catch (error) {
      const importError: ImportError = {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'Import failed',
        originalError: error instanceof Error ? error : undefined,
      }

      setState({
        status: 'error',
        progress: {
          current: 0,
          total: seeds.reduce((total, seed) => total + seed.folders.length + seed.notes.length, 0),
          stage: 'validating',
        },
        result: null,
        error: importError,
      })

      throw importError
    }
  }, [updateProgress])

  const isImporting = state.status === 'validating' || state.status === 'importing'

  return {
    ...state,
    reset,
    importSingleSeed,
    importMultipleSeeds,
    isImporting,
  }
}