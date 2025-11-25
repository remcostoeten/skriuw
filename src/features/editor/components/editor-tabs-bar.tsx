import { X } from 'lucide-react'

import { cn } from '@/shared/utilities'

import type { EditorTab } from '@/features/editor/tabs'

type EditorTabsBarProps = {
  tabs: EditorTab[]
  activeNoteId: string | null
  onSelect: (noteId: string) => void
  onClose: (noteId: string) => void
}

export function EditorTabsBar({ tabs, activeNoteId, onSelect, onClose }: EditorTabsBarProps) {
  if (!tabs.length) return null

  return (
    <div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm">
      <div
        className="skriuw-tabs-scroll flex items-stretch gap-1 overflow-x-auto px-2 py-1"
        role="tablist"
        aria-label="Open notes"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.noteId === activeNoteId
          return (
            <div
              key={tab.noteId}
              role="tab"
              aria-selected={isActive}
              className={cn(
                'group flex min-w-[140px] max-w-[220px] items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-xs transition-colors',
                isActive
                  ? 'bg-background text-foreground border-border/70 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => onSelect(tab.noteId)}
              >
                {tab.title}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Close ${tab.title}`}
                onClick={() => onClose(tab.noteId)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
      <style>{`
        .skriuw-tabs-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
