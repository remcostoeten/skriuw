import { buildMentionCandidates } from "../utils/note-mention-search";
import { useNotesContext } from "@/features/notes/context/notes-context";
import { useMemo } from "react";

export function useNoteMentionCandidates() {
	const { items } = useNotesContext()

	return useMemo(() => buildMentionCandidates(items), [items])
}
