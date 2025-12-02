import { useMemo } from 'react'
import { slugify, generateNoteSlug } from '@quantum-work/core-logic'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import type { Item } from '@/features/notes/types'

/**
 * Hook to resolve note slugs to IDs and get slugs for notes
 */
export function useNoteSlug(items: Item[]) {
	const notesInOrder = useMemo(() => flattenNotes(items), [items])

	// Build a map of slug -> noteId and noteId -> slug
	const slugToIdMap = useMemo(() => {
		const map = new Map<string, string>()
		const slugCounts = new Map<string, number>()

		// First pass: count slugs
		notesInOrder.forEach((note) => {
			const baseSlug = slugify(note.name)
			slugCounts.set(baseSlug, (slugCounts.get(baseSlug) || 0) + 1)
		})

		// Second pass: assign slugs (use ID suffix for duplicates)
		const usedSlugs = new Map<string, string>()
		notesInOrder.forEach((note) => {
			const baseSlug = slugify(note.name)
			const isDuplicate = (slugCounts.get(baseSlug) || 0) > 1
			const slug = isDuplicate ? `${baseSlug}-${note.id.slice(-6)}` : baseSlug

			map.set(slug, note.id)
			usedSlugs.set(note.id, slug)
		})

		return { slugToId: map, idToSlug: usedSlugs }
	}, [notesInOrder])

	/**
	 * Resolve a slug or ID to a note ID
	 * Falls back to treating the input as an ID if slug not found
	 */
	const resolveNoteId = useMemo(() => {
		return (slugOrId: string): string | null => {
			// First try as slug
			const noteId = slugToIdMap.slugToId.get(slugOrId)
			if (noteId) return noteId

			// Fall back to treating as ID (for backwards compatibility)
			const note = notesInOrder.find((n) => n.id === slugOrId)
			return note?.id || null
		}
	}, [slugToIdMap, notesInOrder])

	/**
	 * Get the slug for a note ID
	 */
	const getNoteSlug = useMemo(() => {
		return (noteId: string): string | null => {
			return slugToIdMap.idToSlug.get(noteId) || null
		}
	}, [slugToIdMap])

	/**
	 * Get the URL path for a note
	 */
	const getNoteUrl = useMemo(() => {
		return (noteId: string): string => {
			const slug = getNoteSlug(noteId)
			return slug ? `/note/${slug}` : `/note/${noteId}`
		}
	}, [getNoteSlug])

	return {
		resolveNoteId,
		getNoteSlug,
		getNoteUrl,
	}
}
