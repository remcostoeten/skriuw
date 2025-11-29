import React, { useState, useMemo } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
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
  Download,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown
} from 'lucide-react'
import type { ParsedSeed, SeedSource } from '../api/types'
import type { DefaultNote, DefaultFolder } from '@/features/notes/utils/initialize-defaults'
import { useSeedImporter } from '../hooks/use-seed-importer'
import { cn } from '@/shared/utilities'

interface SeedImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seeds: ParsedSeed[]
  onImport?: (seeds: ParsedSeed[]) => void
}

type TreeItem = {
  name: string
  type: 'folder' | 'note'
  children?: TreeItem[]
}

// Folder closed SVG (matching sidebar)
const FolderClosedIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" width="1em" height="1em" viewBox="0 0 20 20">
    <path fillRule="evenodd" clipRule="evenodd" d="M7.59655 2.20712C7.10136 1.9989 6.56115 1.99943 5.9023 2.00007L4.40479 2.00015C3.57853 2.00013 2.88271 2.0001 2.32874 2.07318C1.74135 2.15066 1.20072 2.32242 0.764844 2.75008C0.328798 3.1779 0.153514 3.70882 0.0744639 4.28569C-4.74114e-05 4.82945 -2.52828e-05 5.51233 9.81743e-07 6.32281V11.8675C-1.65965e-05 13.1029 -3.08677e-05 14.1058 0.108284 14.8963C0.221156 15.72 0.464085 16.4241 1.03541 16.9846C1.60656 17.545 2.32369 17.7831 3.16265 17.8938C3.96804 18 4.99002 18 6.2493 18H13.7507C15.01 18 16.032 18 16.8374 17.8938C17.6763 17.7831 18.3934 17.545 18.9646 16.9846C19.5359 16.4241 19.7788 15.72 19.8917 14.8963C20 14.1058 20 13.1029 20 11.8676V9.94525C20 8.70992 20 7.70702 19.8917 6.91657C19.7788 6.09287 19.5359 5.38878 18.9646 4.82823C18.3934 4.26785 17.6763 4.02972 16.8374 3.91905C16.0319 3.81281 15.0099 3.81283 13.7506 3.81285L9.91202 3.81285C9.70527 3.81285 9.59336 3.81232 9.51046 3.80596C9.47861 3.80352 9.461 3.80081 9.45249 3.79919C9.44546 3.79427 9.43137 3.78367 9.40771 3.76281C9.34589 3.70835 9.26838 3.62926 9.12578 3.48235L8.91813 3.26831C8.46421 2.79975 8.09187 2.4154 7.59655 2.20712ZM2.53158 3.55817C2.97217 3.50005 3.5649 3.49846 4.45741 3.49846H5.77707C6.19724 3.49846 6.45952 3.50169 6.63994 3.51453C6.81907 3.52729 6.91262 3.54925 6.99675 3.58462C7.08084 3.61998 7.16148 3.67125 7.29433 3.78964C7.42818 3.90891 7.6114 4.09298 7.90119 4.39152L8.02253 4.51653L8.07907 4.57502C8.29018 4.79381 8.5293 5.04163 8.85233 5.17747C9.17524 5.31324 9.52282 5.31222 9.82983 5.31132L9.91202 5.31115H13.6951C15.023 5.31115 15.9424 5.31274 16.6345 5.40404C17.3048 5.49246 17.6468 5.6525 17.8873 5.88854C18.1277 6.12441 18.2906 6.45944 18.3807 7.11653C18.4737 7.79534 18.4753 8.69706 18.4753 10.0001V11.8128C18.4753 13.1158 18.4737 14.0175 18.3807 14.6963C18.2906 15.3534 18.1277 15.6884 17.8873 15.9243C17.6468 16.1603 17.3048 16.3204 16.6345 16.4088C15.9424 16.5001 15.023 16.5017 13.6951 16.5017H6.30494C4.97698 16.5017 4.05764 16.5001 3.36549 16.4088C2.69519 16.3204 2.35324 16.1603 2.11266 15.9243C1.87226 15.6884 1.70936 15.3534 1.61932 14.6963C1.5263 14.0175 1.52468 13.1158 1.52468 11.8128V6.37469C1.52468 5.49891 1.5263 4.91765 1.5855 4.48566C1.64172 4.07541 1.73696 3.91355 1.8421 3.81039C1.94741 3.70706 2.11288 3.6134 2.53158 3.55817Z" fill="currentColor" />
  </svg>
)

// Folder open SVG (matching sidebar)
const FolderOpenIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" width="1em" height="1em" viewBox="0 0 20 20">
    <path fillRule="evenodd" clipRule="evenodd" d="M6.22891 18C4.9566 18 3.93097 18 3.1244 17.8935C2.28697 17.7828 1.58187 17.5461 1.02187 16.9958C0.461866 16.4455 0.221 15.7526 0.108411 14.9296C-3.31178e-05 14.137 -1.7645e-05 13.1291 1.54211e-06 11.8788L1.04302e-06 6.29541C-2.62958e-05 5.47395 -4.90919e-05 4.78896 0.0743487 4.24516C0.152876 3.67118 0.325617 3.15297 0.74937 2.73655C1.17312 2.32012 1.70045 2.15037 2.28453 2.0732C2.83789 2.00009 3.53494 2.00011 4.37086 2.00013L5.92613 2.00007C6.57085 1.99946 7.08108 1.99899 7.55104 2.18869C8.021 2.37838 8.38357 2.73117 8.84171 3.17694L9.0622 3.39116C9.20356 3.52844 9.28285 3.60481 9.3465 3.65795C9.37486 3.68162 9.3916 3.69332 9.4005 3.699C9.40472 3.70169 9.40712 3.70298 9.40801 3.70345L9.40913 3.70399L9.41032 3.70438C9.41129 3.70466 9.41391 3.7054 9.41884 3.7064C9.42923 3.70851 9.44951 3.71175 9.48661 3.7145C9.56989 3.72068 9.68092 3.72113 9.87965 3.72113L13.0938 3.72111C13.6755 3.72097 14.072 3.72087 14.4167 3.78961C15.79 4.06347 16.8634 5.11825 17.1421 6.46785C17.2021 6.75842 17.2105 7.08647 17.2116 7.53472C17.4034 7.54922 17.5834 7.56801 17.7514 7.59237C18.5137 7.70289 19.1943 7.94917 19.633 8.57761C20.0718 9.20605 20.0607 9.91867 19.8913 10.6574C19.7278 11.3702 19.3805 12.2551 18.9553 13.3383L18.6619 14.0858C18.3405 14.9047 18.0787 15.5717 17.8049 16.0905C17.5191 16.6321 17.1912 17.0712 16.7057 17.3985C16.2202 17.7258 15.6854 17.8685 15.0682 17.9356C14.4771 18 13.7497 18 12.8565 18L6.22891 18ZM5.81464 3.37155C6.62543 3.37155 6.83809 3.3835 7.0208 3.45726C7.20351 3.53101 7.36332 3.6694 7.94002 4.22946L8.08126 4.36662L8.13369 4.41774C8.34687 4.62596 8.57694 4.85067 8.8789 4.97256C9.18086 5.09444 9.50523 5.09353 9.8058 5.09268L9.87965 5.09254H13.0114C13.7067 5.09254 13.9504 5.096 14.1392 5.13363C14.9632 5.29795 15.6072 5.93081 15.7744 6.74058C15.805 6.88885 15.8134 7.07165 15.8155 7.48813C15.5174 7.48575 15.2019 7.48576 14.8692 7.48577H7.25505C6.70129 7.48575 6.23171 7.48573 5.84482 7.52626C5.43305 7.56939 5.05328 7.66313 4.69832 7.88867C4.34336 8.11422 4.10052 8.41609 3.89152 8.76739C3.69515 9.09748 3.50247 9.51829 3.27524 10.0146L2.3991 11.9279C2.00422 12.7902 1.66601 13.5287 1.435 14.1586C1.39636 13.5526 1.39555 12.7992 1.39555 11.8286V6.34295C1.39555 5.46158 1.39703 4.86953 1.45745 4.4279C1.51517 4.006 1.61493 3.82543 1.73617 3.70628C1.85741 3.58714 2.04116 3.48911 2.47048 3.43238C2.91988 3.37301 3.52235 3.37155 4.41923 3.37155H5.81464ZM14.8113 8.85718C16.0648 8.85718 16.9261 8.85897 17.5477 8.9491C18.1547 9.0371 18.3667 9.18785 18.4823 9.35347C18.5979 9.5191 18.6648 9.76768 18.5299 10.3559C18.3918 10.9583 18.0835 11.7486 17.6324 12.8979L17.3741 13.556C17.035 14.4199 16.8002 15.0155 16.5661 15.4591C16.34 15.8875 16.1443 16.1139 15.9162 16.2677C15.688 16.4215 15.4027 16.5194 14.9146 16.5726C14.4093 16.6276 13.7592 16.6285 12.8169 16.6285H6.4533C5.13332 16.6285 4.22286 16.6267 3.56903 16.5315C2.92754 16.438 2.71197 16.278 2.59893 16.1062C2.48589 15.9344 2.42586 15.6756 2.6024 15.0624C2.78233 14.4373 3.15427 13.6207 3.69594 12.4378L4.53327 10.6092C4.77905 10.0725 4.94187 9.71911 5.09629 9.45955C5.24227 9.21416 5.34986 9.1078 5.45606 9.04032C5.56226 8.97284 5.70511 8.92008 5.99273 8.88995C6.29696 8.85808 6.6917 8.85718 7.29063 8.85718H14.8113Z" fill="currentColor" />
  </svg>
)

// Build tree structure from notes and folders
function buildTree(notes: DefaultNote[], folders: DefaultFolder[]): TreeItem[] {
  const folderMap = new Map<string, TreeItem>()
  const rootItems: TreeItem[] = []

  // First pass: create all folders
  folders.forEach(folder => {
    const treeFolder: TreeItem = {
      name: folder.name,
      type: 'folder',
      children: []
    }
    folderMap.set(folder.name, treeFolder)
  })

  // Second pass: build hierarchy
  folders.forEach(folder => {
    const treeFolder = folderMap.get(folder.name)!
    if (folder.parentFolderName) {
      const parent = folderMap.get(folder.parentFolderName)
      if (parent) {
        parent.children!.push(treeFolder)
      } else {
        rootItems.push(treeFolder)
      }
    } else {
      rootItems.push(treeFolder)
    }
  })

  // Third pass: add notes to folders
  notes.forEach(note => {
    const treeNote: TreeItem = {
      name: note.name,
      type: 'note'
    }
    if (note.parentFolderName) {
      const parent = folderMap.get(note.parentFolderName)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(treeNote)
      } else {
        rootItems.push(treeNote)
      }
    } else {
      rootItems.push(treeNote)
    }
  })

  return rootItems
}

function TreeItemComponent({ 
  item, 
  level = 0,
  expandedFolders,
  onToggleFolder,
  basePath = ''
}: { 
  item: TreeItem
  level?: number
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  basePath?: string
}) {
  const isFolder = item.type === 'folder'
  const itemPath = basePath ? `${basePath}/${item.name}` : item.name
  const isExpanded = expandedFolders.has(itemPath)
  const hasChildren = item.children && item.children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 rounded-sm hover:bg-accent/50"
        style={{ paddingLeft: `${0.5 + level * 0.75}rem` }}
      >
        {isFolder ? (
          <>
            <button
              onClick={() => onToggleFolder(itemPath)}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            <div className="shrink-0 text-muted-foreground">
              {isExpanded ? <FolderOpenIcon /> : <FolderClosedIcon />}
            </div>
          </>
        ) : (
          <>
            <div className="w-[18px] shrink-0" />
            <FileText className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="text-xs truncate text-foreground">{item.name}</span>
      </div>
      {isFolder && isExpanded && hasChildren && (
        <div className="space-y-0.5">
          {item.children!.map((child, idx) => (
            <TreeItemComponent
              key={`${itemPath}-${idx}-${child.name}`}
              item={child}
              level={level + 1}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              basePath={itemPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SeedItem({ seed, isSelected, onSelect, expandedFolders, onToggleFolder }: {
  seed: ParsedSeed
  isSelected: boolean
  onSelect: (seed: ParsedSeed) => void
  expandedFolders: Set<string>
  onToggleFolder: (seedName: string, path: string) => void
}) {
  const tree = useMemo(() => buildTree(seed.notes, seed.folders), [seed.notes, seed.folders])
  const seedExpandedKey = `seed-${seed.metadata.name}`
  const isSeedExpanded = expandedFolders.has(seedExpandedKey)

  return (
    <div className="border-b last:border-b-0">
      <CommandItem
        value={seed.metadata.name}
        onSelect={() => onSelect(seed)}
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFolder(seed.metadata.name, seedExpandedKey)
            }}
            className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            {isSeedExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="font-medium truncate text-sm">{seed.metadata.name}</div>
            {seed.metadata.description && (
              <div className="text-xs text-muted-foreground truncate">
                {seed.metadata.description}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {seed.notes.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {seed.notes.length} note{seed.notes.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {seed.folders.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {seed.folders.length} folder{seed.folders.length !== 1 ? 's' : ''}
              </Badge>
            )}
            <Badge
              variant={seed.metadata.source === 'defaults' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {seed.metadata.source}
            </Badge>
          </div>

          {isSelected && (
            <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
          )}
        </div>
      </CommandItem>
      
      {isSeedExpanded && tree.length > 0 && (
        <div className="px-3 pb-3 bg-muted/30">
          <div className="space-y-0.5 pt-2">
            {tree.map((item, idx) => (
              <TreeItemComponent
                key={`${seed.metadata.name}-${idx}-${item.name}`}
                item={item}
                level={0}
                expandedFolders={expandedFolders}
                onToggleFolder={(path) => onToggleFolder(seed.metadata.name, path)}
                basePath={seedExpandedKey}
              />
            ))}
          </div>
        </div>
      )}
    </div>
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const {
    status,
    progress,
    result,
    error,
    reset,
    importMultipleSeeds,
    isImporting,
  } = useSeedImporter()

  const handleToggleFolder = (seedName: string, path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

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
      setExpandedFolders(new Set())
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
            <CheckCircle className="h-16 w-16 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">
                  {result.imported.notes.length + result.imported.folders.length}
                </div>
                <div className="text-sm text-muted-foreground">Items Imported</div>
              </div>

              {(result.skipped.notes.length > 0 || result.skipped.folders.length > 0) && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-muted-foreground">
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
            <XCircle className="h-16 w-16 text-destructive mb-4" />
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
                                expandedFolders={expandedFolders}
                                onToggleFolder={handleToggleFolder}
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