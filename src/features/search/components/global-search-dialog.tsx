import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/shared/ui/command'

import { useNotes } from '@/features/notes/hooks/useNotes'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { blocksToText } from '@/features/notes/utils/blocks-to-text'
import { useSettings } from '@/features/settings'

import type { Note } from '@/features/notes/types'

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const navigate = useNavigate()
  const { items } = useNotes()
  const { getSetting } = useSettings()
  const [searchQuery, setSearchQuery] = useState('')
  const searchInContent = getSetting('searchInContent') ?? false

  // Get all notes from the tree
  const allNotes = useMemo(() => flattenNotes(items), [items])

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) {
      return allNotes.slice(0, 50) // Show first 50 notes when no query
    }

    const query = searchQuery.toLowerCase().trim()
    const matches: Array<{ note: Note; score: number }> = []

    for (const note of allNotes) {
      let score = 0

      // Check if name matches
      const nameMatches = note.name.toLowerCase().includes(query)
      if (nameMatches) {
        score += 2 // Name matches are weighted higher
      }

      // Check if content matches (if enabled)
      let contentMatches = false
      if (searchInContent && note.content && Array.isArray(note.content)) {
        try {
          const contentText = blocksToText(note.content)
          contentMatches = contentText.toLowerCase().includes(query)
          if (contentMatches) {
            score += 1
          }
        } catch (error) {
          console.warn('Failed to extract text from note content:', error)
        }
      }

      if (nameMatches || contentMatches) {
        matches.push({ note, score })
      }
    }

    // Sort by score (highest first), then by name
    return matches
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.note.name.localeCompare(b.note.name)
      })
      .slice(0, 50)
      .map(({ note }) => note)
  }, [allNotes, searchQuery, searchInContent])

  const handleSelectNote = useCallback((noteId: string) => {
    navigate(`/note/${noteId}`)
    onOpenChange(false)
    setSearchQuery('')
  }, [navigate, onOpenChange])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search notes..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>No notes found.</CommandEmpty>
        {filteredNotes.length > 0 && (
          <CommandGroup heading="Notes">
            {filteredNotes.map((note) => (
              <CommandItem
                key={note.id}
                value={`${note.name} ${note.id}`}
                onSelect={() => handleSelectNote(note.id)}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{note.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

