export const NOTE_TAB_DRAG_TYPE = 'application/x-skriuw-note-tab'

export type NoteTabDragPayload = {
	noteId: string
	sourcePaneId: string | null
}
