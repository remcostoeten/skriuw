'use client'

import { useState, useMemo, useCallback } from 'react'
import type { ComponentType } from 'react'
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
import { TOCItem } from './toc-item'
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
    initSections
  )
  const [isToggling, setIsToggling] = useState(false)

  const currentNote = useMemo(function currentNote(): Note | null {
    if (!noteId) return null
    const found = items.find(function matchItem(item) {
      return item.id === noteId && item.type === 'note'
    })
    return (found as Note) ?? null
  }, [noteId, items])

  const tableOfContents = useTableOfContents(content)
  const metadata = useNoteMetadata(currentNote, content)
  const shareUrl = useShareUrl(currentNote?.publicId)
  const scrollToHeading = useScrollToHeading()

  const toggleSection = useCallback(function toggleSection(section: string) {
    setExpandedSections(function updateSections(prev) {
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
    async function handleToggleVisibility(nextState: boolean) {
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
    <aside className="fixed right-0 top-0 h-full w-[340px] bg-background/95 backdrop-blur border-l border-border/60 shadow-[0_0_40px_rgba(0,0,0,0.35)] z-40 flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-5 pb-4 border-b border-border/60">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Note panel
          </p>
          <h2 className="text-base font-semibold text-foreground truncate">
            {currentNote?.name ?? 'Note details'}
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            {metadata?.updatedAt ?? 'No note selected'}
          </p>
        </div>
        <IconButton
          icon={<X className="w-4 h-4" />}
          tooltip="Close sidebar"
          variant="toolbar"
          onClick={toggleRightSidebar}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 space-y-4">
        <div className="rounded-2xl border border-border/60 bg-muted/10 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Public share</span>
            </div>
            <Switch
              checked={currentNote?.isPublic ?? false}
              onCheckedChange={handleToggleVisibility}
              disabled={isToggling || !currentNote}
              aria-label="Toggle public visibility"
            />
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            {currentNote?.isPublic ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <span>Unique visitors</span>
                  <span className="text-foreground">{currentNote.publicViews ?? 0}</span>
                </div>
                {shareUrl ? (
                  <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-[11px] text-foreground/80 break-all">
                    {shareUrl}
                  </div>
                ) : (
                  <span>Enable cloud storage to generate a public link.</span>
                )}
              </div>
            ) : (
              <span>Keep notes private by default. Enable sharing to create a link.</span>
            )}
          </div>
        </div>

        <CollapsibleSection
          id={SECTION_KEYS.TOC}
          title="Table of contents"
          icon={<FileText className="w-4 h-4" />}
          isExpanded={expandedSections.has(SECTION_KEYS.TOC)}
          onToggle={toggleSection}
        >
          {tableOfContents.length > 0 ? (
            <div className="space-y-1">
              {tableOfContents.map(function renderItem(item) {
                return (
                  <TOCItem
                    key={item.id}
                    item={item}
                    onNavigate={scrollToHeading}
                  />
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No headings found</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          id={SECTION_KEYS.METADATA}
          title="Info"
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

        <CollapsibleSection
          id={SECTION_KEYS.HISTORY}
          title="Version history"
          icon={<GitBranch className="w-4 h-4" />}
          isExpanded={expandedSections.has(SECTION_KEYS.HISTORY)}
          onToggle={toggleSection}
        >
          <p className="text-sm text-muted-foreground">
            Version history coming soon...
          </p>
        </CollapsibleSection>
      </div>
    </aside>
  )
}

type MetadataRowProps = {
  icon: ComponentType<{ className?: string }>
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

function initSections() {
  return new Set(DEFAULT_EXPANDED_SECTIONS)
}
