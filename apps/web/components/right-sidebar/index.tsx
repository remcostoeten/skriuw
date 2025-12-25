'use client'

import { useState, useMemo, useCallback } from 'react'
import { notify } from '@/lib/notify'
import {
  FileText,
  Calendar,
  Clock,
  Hash,
  HardDrive,
  Share2,
  Eye,
  Tag,
  GitBranch,
  X,
} from 'lucide-react'
import { IconButton } from '@skriuw/ui/icons'
import { Switch } from '@skriuw/ui'
import { useUIStore } from '../../stores/ui-store'
import { useNotesContext } from '@/features/notes/context/notes-context'
import type { Note } from '@/features/notes/types'
import { CollapsibleSection } from './collapsible-section'
import { MemoizedTOCItem } from './toc-item'
import {
  useTableOfContents,
  useNoteMetadata,
  useShareUrl,
  useScrollToHeading,
} from './hooks'
import { SECTION_KEYS, type SectionKey, type RightSidebarProps } from './types'

const DEFAULT_EXPANDED_SECTIONS = new Set<SectionKey>([
  SECTION_KEYS.TOC,
  SECTION_KEYS.METADATA,
])

export function RightSidebar({ noteId, content = [] }: RightSidebarProps) {
  const { isRightSidebarOpen, toggleRightSidebar } = useUIStore()
  const { items, setNoteVisibility } = useNotesContext()

  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    () => new Set(DEFAULT_EXPANDED_SECTIONS)
  )
  const [isToggling, setIsToggling] = useState(false)

  // Find current note with proper typing
  const currentNote = useMemo((): Note | null => {
    if (!noteId) return null
    const found = items.find((item) => item.id === noteId && item.type === 'note')
    return (found as Note) ?? null
  }, [noteId, items])

  // Use extracted hooks
  const tableOfContents = useTableOfContents(content)
  const metadata = useNoteMetadata(currentNote, content)
  const shareUrl = useShareUrl(currentNote?.publicId)
  const scrollToHeading = useScrollToHeading()

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section as SectionKey)) {
        next.delete(section as SectionKey)
      } else {
        next.add(section as SectionKey)
      }
      return next
    })
  }, [])

  const handleToggleVisibility = useCallback(
    async (nextState: boolean) => {
      if (!currentNote) return
      setIsToggling(true)
      try {
        await setNoteVisibility(currentNote.id, nextState)
        notify(nextState ? 'Note is now public' : 'Note is now private')
      } catch (error) {
        console.error('Failed to toggle visibility', error)
        notify(
          error instanceof Error ? error.message : 'Failed to toggle visibility'
        )
      } finally {
        setIsToggling(false)
      }
    },
    [currentNote, setNoteVisibility]
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
        <CollapsibleSection
          id={SECTION_KEYS.TOC}
          title="Table of Contents"
          icon={<FileText className="w-4 h-4" />}
          isExpanded={expandedSections.has(SECTION_KEYS.TOC)}
          onToggle={toggleSection}
        >
          {tableOfContents.length > 0 ? (
            <div className="space-y-1">
              {tableOfContents.map((item) => (
                <MemoizedTOCItem
                  key={item.id}
                  item={item}
                  onNavigate={scrollToHeading}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No headings found</p>
          )}
        </CollapsibleSection>

        {/* Metadata */}
        <CollapsibleSection
          id={SECTION_KEYS.METADATA}
          title="Metadata"
          icon={<Hash className="w-4 h-4" />}
          isExpanded={expandedSections.has(SECTION_KEYS.METADATA)}
          onToggle={toggleSection}
        >
          {metadata ? (
            <div className="space-y-3">
              <MetadataRow icon={Calendar} label="Created" value={metadata.createdAt} />
              <MetadataRow icon={Clock} label="Updated" value={metadata.updatedAt} />
              <MetadataRow icon={FileText} label="Words" value={metadata.wordCount} />
              <MetadataRow icon={HardDrive} label="Size" value={metadata.size} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No note selected</p>
          )}
        </CollapsibleSection>

        {/* Sharing */}
        <div className="border border-border rounded-lg">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              <span className="font-medium">Public Share</span>
            </div>
            <Switch
              checked={currentNote?.isPublic ?? false}
              onCheckedChange={handleToggleVisibility}
              disabled={isToggling || !currentNote}
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
                <div
                  className="bg-muted rounded-md p-2 break-all text-xs"
                  aria-label="Share URL"
                >
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

        {/* Tags - Placeholder */}
        <CollapsibleSection
          id={SECTION_KEYS.TAGS}
          title="Tags"
          icon={<Tag className="w-4 h-4" />}
          isExpanded={expandedSections.has(SECTION_KEYS.TAGS)}
          onToggle={toggleSection}
        >
          <p className="text-sm text-muted-foreground">
            Tagging system coming soon...
          </p>
        </CollapsibleSection>

        {/* Version History - Placeholder */}
        <CollapsibleSection
          id={SECTION_KEYS.HISTORY}
          title="Version History"
          icon={<GitBranch className="w-4 h-4" />}
          isExpanded={expandedSections.has(SECTION_KEYS.HISTORY)}
          onToggle={toggleSection}
        >
          <p className="text-sm text-muted-foreground">
            Git-like versioning coming soon...
          </p>
        </CollapsibleSection>
      </div>
    </div>
  )
}

// Small helper component to reduce repetition in metadata rows
type MetadataRowProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
}

function MetadataRow({ icon: Icon, label, value }: MetadataRowProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
    </div>
  )
}
