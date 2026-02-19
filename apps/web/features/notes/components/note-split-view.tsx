'use client'

import { NoteEditor } from '../../editor/components/note-editor'

type NoteSplitViewProps = {
	noteId: string
}

/**
 * Single-pane note view. Previously a split-view component;
 * split-view has been removed as it was non-functional (edits in
 * one pane were not reflected in the other).
 */
export function NoteSplitView({ noteId }: NoteSplitViewProps) {
	return <NoteEditor key={noteId} noteId={noteId} />
}
