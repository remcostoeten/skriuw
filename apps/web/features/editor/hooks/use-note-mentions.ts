import { useMemo } from 'react'

import { useNotes } from '../../notes'

import { buildMentionCandidates } from '../utils/note-mention-search'

export function useNoteMentionCandidates() {
	const { items } = useNotes()

	return useMemo(() => buildMentionCandidates(items), [items])
}
