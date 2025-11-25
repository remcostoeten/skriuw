import React, { useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Progress } from '@/shared/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { ScrollArea } from '@/shared/ui/scroll-area'
import {
  FileText,
  Folder,
  Download,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'
import type { ParsedSeed, SeedSource } from '../api/types'
import { useSeedImporter } from '../hooks/use-seed-importer'

interface SeedImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seeds: ParsedSeed[]
  onImport?: (seeds: ParsedSeed[]) => void
}

function SeedItem({ seed, isSelected, onSelect }: {
  seed: ParsedSeed
  isSelected: boolean
  onSelect: (seed: ParsedSeed) => void
}) {
  return (
    <CommandItem
      value={seed.metadata.name}
      onSelect={() => onSelect(seed)}
      className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent"
    >
      <div className="flex items-center gap-2 flex-1">
        {seed.notes.length > 0 && <FileText className="h-4 w-4 text-blue-500" />}
        {seed.folders.length > 0 && <Folder className="h-4 w-4 text-yellow-500" />}

        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{seed.metadata.name}</div>
          <div className="text-sm text-muted-foreground truncate">
            {seed.metadata.description}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {seed.notes.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {seed.notes.length} notes
            </Badge>
          )}
          {seed.folders.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {seed.folders.length} folders
            </Badge>
          )}
          <Badge
            variant={seed.metadata.source === 'defaults' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {seed.metadata.source}
          </Badge>
        </div>

        {isSelected && <CheckCircle className="h-4 w-4 text-green-500" />}
      </div>
    </CommandItem>
  )
}

export function SeedImportDialog({
  open,
  onOpenChange,
  seeds,
  onImport
}: SeedImportDialogProps) {
  const [selectedSeeds, setSelectedSeeds] = useState<ParsedSeed[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSource, setActiveSource] = useState<SeedSource | 'all'>('all')
  const [showPreview, setShowPreview] = useState(false)
  const [previewSeed, setPreviewSeed] = useState<ParsedSeed | null>(null)

  const {
    status,
    progress,
    result,
    error,
    reset,
    importMultipleSeeds,
    isImporting,
  } = useSeedImporter()

  // Filter seeds based on search and source
  const filteredSeeds = seeds.filter(seed => {
    const matchesSearch = seed.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         seed.metadata.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSource = activeSource === 'all' || seed.metadata.source === activeSource

    return matchesSearch && matchesSource
  })

  const handleSelectSeed = (seed: ParsedSeed) => {
    setSelectedSeeds(prev => {
      const isSelected = prev.some(s => s.metadata.name === seed.metadata.name)
      if (isSelected) {
        return prev.filter(s => s.metadata.name !== seed.metadata.name)
      } else {
        return [...prev, seed]
      }
    })
  }

  const handlePreviewSeed = (seed: ParsedSeed) => {
    setPreviewSeed(seed)
    setShowPreview(true)
  }

  const handleImport = async () => {
    if (selectedSeeds.length === 0) return

    try {
      await importMultipleSeeds(selectedSeeds, {
        skipDuplicates: true,
        createFolders: true,
      })

      onImport?.(selectedSeeds)
      setSelectedSeeds([])
    } catch (error) {
      console.error('Import failed:', error)
    }
  }

  const handleClose = () => {
    if (!isImporting) {
      onOpenChange(false)
      reset()
      setSelectedSeeds([])
    }
  }

  const getProgressPercentage = () => {
    if (progress.total === 0) return 0
    return (progress.current / progress.total) * 100
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import Seeds
          </DialogTitle>
        </DialogHeader>

        {status === 'complete' && result ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {result.imported.notes.length + result.imported.folders.length}
                </div>
                <div className="text-sm text-muted-foreground">Items Imported</div>
              </div>

              {(result.skipped.notes.length > 0 || result.skipped.folders.length > 0) && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {result.skipped.notes.length + result.skipped.folders.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Items Skipped</div>
                </div>
              )}
            </div>

            <Button onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center justify-center py-8">
            <XCircle className="h-16 w-16 text-red-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Import Failed</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              {error?.message || 'An unexpected error occurred during import.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Try Again
              </Button>
              <Button onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress Bar */}
            {isImporting && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {progress.stage === 'validating' && 'Validating seeds...'}
                    {progress.stage === 'creating-folders' && 'Creating folders...'}
                    {progress.stage === 'creating-notes' && 'Creating notes...'}
                    {progress.stage === 'complete' && 'Complete!'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <Progress value={getProgressPercentage()} className="w-full" />
              </div>
            )}

            {/* Source Filter Tabs */}
            <Tabs value={activeSource} onValueChange={(value) => setActiveSource(value as SeedSource | 'all')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All Seeds</TabsTrigger>
                <TabsTrigger value="defaults">Defaults</TabsTrigger>
                <TabsTrigger value="generated">Generated</TabsTrigger>
              </TabsList>

              <div className="flex flex-col flex-1 min-h-0">
                {/* Search and Actions */}
                <div className="flex items-center gap-2 p-3 border-b">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search seeds..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {selectedSeeds.length > 0 && (
                      <Badge variant="default">
                        {selectedSeeds.length} selected
                      </Badge>
                    )}
                    <span>
                      {filteredSeeds.length} seeds
                    </span>
                  </div>
                </div>

                {/* Seeds List */}
                <div className="flex-1 min-h-0">
                  <Command shouldFilter={false}>
                    <CommandList>
                      <ScrollArea className="h-[400px]">
                        {filteredSeeds.length === 0 ? (
                          <CommandEmpty className="py-8 text-center">
                            {searchQuery ? 'No seeds found matching your search.' : 'No seeds available.'}
                          </CommandEmpty>
                        ) : (
                          <CommandGroup heading="Available Seeds">
                            {filteredSeeds.map((seed) => (
                              <SeedItem
                                key={`${seed.metadata.source}-${seed.metadata.name}`}
                                seed={seed}
                                isSelected={selectedSeeds.some(s => s.metadata.name === seed.metadata.name)}
                                onSelect={handleSelectSeed}
                              />
                            ))}
                          </CommandGroup>
                        )}
                      </ScrollArea>
                    </CommandList>
                  </Command>
                </div>
              </div>
            </Tabs>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t bg-muted/50">
              <div className="text-sm text-muted-foreground">
                {selectedSeeds.length > 0 && (
                  <span>
                    {selectedSeeds.reduce((total, seed) => total + seed.notes.length + seed.folders.length, 0)} items will be imported
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedSeeds.length === 0 || isImporting}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Import {selectedSeeds.length} Seed{selectedSeeds.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}