"use client";

import { useAuthedApiQuery } from "@/shared/api";
import type { GraphData } from "@/domain/notes/graph";
import { fetchNoteGraph } from "@/domain/notes/actions";
import { notesKeys } from "../lib/notes-keys";

export function useNoteGraph() {
	return useAuthedApiQuery<GraphData>(notesKeys.graph(), () => fetchNoteGraph(), {
		staleTime: 30_000,
	});
}
