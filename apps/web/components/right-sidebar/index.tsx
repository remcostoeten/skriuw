'use client'

import { useState, useMemo } from 'react'
import {
  FileText,
  Calendar,
  Clock,
  Hash,
  HardDrive,
  ChevronRight,
  ChevronDown,
  Share2,
  Eye,
  Tag,
  GitBranch,
  X
} from 'lucide-react'
import { cn } from '@skriuw/shared'
import { IconButton } from '@skriuw/ui/icons'
import { Switch } from '@skriuw/ui'
import { useUIStore } from '../../stores/ui-store'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { blocksToText } from '@/features/notes/utils/blocks-to-text'
import type { Block } from '@blocknote/core'

type TOCItem = {
  id: string
  title: string
  level: number
  children: TOCItem[]
}

type NoteMetadata = {
  createdAt: string
  updatedAt: string
  wordCount: number
  size: string
}

type RightSidebarProps = {
  noteId?: string
  content?: Block[] // BlockNote content blocks
}

export function RightSidebar({ noteId, content = [] }: RightSidebarProps) {
  const { isRightSidebarOpen, toggleRightSidebar } = useUIStore()
  const { items, setNoteVisibility } = useNotesContext()
  
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['toc', 'metadata'])
  )

  // Find current note
  const currentNote = useMemo(() => {
    if (!noteId) return null
    return items.find(item => item.id === noteId && item.type === 'note') || null
  }, [noteId, items])

  const shareUrl = useMemo(() => {
    if (!currentNote?.publicId || typeof window === 'undefined') return ''
    const origin = window.location.origin
    return `${origin}/public/${currentNote.publicId}`
  }, [currentNote?.publicId])

  // Generate table of contents from BlockNote content
  const tableOfContents = useMemo((): TOCItem[] => {
    if (!content || content.length === 0) return []

    const toc: TOCItem[] = []
    const stack: TOCItem[] = []

    content.forEach((block: Block) => {
      if (block.type === 'heading' && block.props?.level) {
        const title = blocksToText([block]).trim()
        if (!title) return

        const item: TOCItem = {
          id: block.id,
          title,
          level: block.props.level,
          children: []
        }

        // Find the appropriate parent in the stack
        while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
          stack.pop()
        }

        if (stack.length === 0) {
          toc.push(item)
        } else {
          stack[stack.length - 1].children.push(item)
        }

        stack.push(item)
      }
    })

    return toc
  }, [content])

  // Calculate note metadata
  const metadata = useMemo((): NoteMetadata | null => {
    if (!currentNote) return null

    const text = blocksToText(content)
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length
    const sizeBytes = new Blob([text]).size
    const size = sizeBytes < 1024 ? `${sizeBytes} B` : `${(sizeBytes / 1024).toFixed(1)} KB`

    return {
      createdAt: currentNote.createdAt ? new Date(currentNote.createdAt).toLocaleDateString() : 'Unknown',
      updatedAt: currentNote.updatedAt ? new Date(currentNote.updatedAt).toLocaleDateString() : 'Unknown',
      wordCount,
      size
    }
  }, [currentNote, content])

  async function toggleVisibility(next: boolean) {
    if (!currentNote) return
    try {
      await setNoteVisibility(currentNote.id, next)
    } catch (error) {
      console.error('Failed to toggle visibility', error)
    }
  }

  function toggleSection(section: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  function scrollToHeading(headingId: string) {
    const element = document.querySelector(`[data-content-type="heading"][data-id="${headingId}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const renderTOCItem = (item: TOCItem, depth = 0) => (
    <div key={item.id}>
      <button
        onClick={() => scrollToHeading(item.id)}
        className={cn(
          'w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors',
          'flex items-center gap-2 text-muted-foreground hover:text-foreground',
          depth > 0 && 'ml-4'
        )}
      >
        <span className="truncate">{item.title}</span>
      </button>
      {item.children.map(child => renderTOCItem(child, depth + 1))}
    </div>
  )

  if (!isRightSidebarOpen) return null

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-background border-l border-border shadow-lg z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Note Details</h2>
        <IconButton
          icon={<X className="w-4 h-4" />}
          tooltip="Close sidebar"
          variant="toolbar"
          onClick={toggleRightSidebar}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Table of Contents */}
        <div className="border border-border rounded-lg">
          <button
            onClick={() => toggleSection('toc')}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="font-medium">Table of Contents</span>
            </div>
            {expandedSections.has('toc') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.has('toc') && (
            <div className="px-2 pb-3">
              {tableOfContents.length > 0 ? (
                <div className="space-y-1">
                  {tableOfContents.map(item => renderTOCItem(item))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground px-3 py-2">
                  No headings found
                </p>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="border border-border rounded-lg">
          <button
            onClick={() => toggleSection('metadata')}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              <span className="font-medium">Metadata</span>
            </div>
            {expandedSections.has('metadata') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.has('metadata') && metadata && (
            <div className="px-3 pb-3 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created:</span>
                <span>{metadata.createdAt}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Updated:</span>
                <span>{metadata.updatedAt}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Words:</span>
                <span>{metadata.wordCount}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Size:</span>
                <span>{metadata.size}</span>
              </div>
            </div>
          )}
        </div>

        {/* Sharing */}
        <div className="border border-border rounded-lg">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              <span className="font-medium">Public Share</span>
            </div>
            <Switch
              checked={!!currentNote?.isPublic}
              onCheckedChange={toggleVisibility}
              aria-label="Toggle public visibility"
            />
          </div>
          {currentNote?.isPublic ? (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Unique visitors:</span>
                <span>{currentNote.publicViews ?? 0}</span>
              </div>
              {shareUrl ? (
                <div className="bg-muted rounded-md p-2 break-all text-xs" aria-label="Share URL">
                  {shareUrl}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground px-1">
                  Enable cloud storage to generate a public link.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-3 pb-3">
              Keep notes private by default. Enable sharing to generate a public link.
            </p>
          )}
        </div>

        {/* Tags - Placeholder for future implementation */}
        <div className="border border-border rounded-lg">
          <button
            onClick={() => toggleSection('tags')}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              <span className="font-medium">Tags</span>
            </div>
            {expandedSections.has('tags') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.has('tags') && (
            <div className="px-3 pb-3">
              <p className="text-sm text-muted-foreground">
                Tagging system coming soon...
              </p>
            </div>
          )}
        </div>

        {/* Version History - Placeholder for future implementation */}
        <div className="border border-border rounded-lg">
          <button
            onClick={() => toggleSection('history')}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              <span className="font-medium">Version History</span>
            </div>
            {expandedSections.has('history') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.has('history') && (
            <div className="px-3 pb-3">
              <p className="text-sm text-muted-foreground">
                Git-like versioning coming soon...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
