import { useMemo } from 'react'

import { useNotesContext } from '@/features/notes/context/notes-context'

import { buildMentionCandidates } from '../utils/note-mention-search'

export function useNoteMentionCandidates() {
	const { items } = useNotesContext()

	return useMemo(() => buildMentionCandidates(items), [items])
}
