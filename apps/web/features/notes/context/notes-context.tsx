'use client'

import { useGuestMigration } from '../hooks/use-guest-migration'
import { useNotes } from '../hooks/use-notes'
import type { Item, Note, Folder } from '../types'
import type { NoteTemplate } from '../utils/get-initial-note-content'
import type { Block } from '@blocknote/core'
import { createContext, useContext, ReactNode } from 'react'

type CreateNoteOptions = {
	template?: NoteTemplate
	icon?: string
	tags?: string[]
}

type NotesContextValue = {
	items: Item[]
	isInitialLoading: boolean
	isRefreshing: boolean
	getNote: (id: string) => Promise<Note | undefined>
	getItem: (id: string) => Promise<Item | undefined>
	createNote: (
		name?: string,
		content?: string | Block[],
		parentFolderId?: string,
		options?: CreateNoteOptions
	) => Promise<Note>
	createFolder: (name?: string, parentFolderId?: string) => Promise<Folder>
	updateNote: (
		id: string,
		content?: Block[],
		name?: string,
		icon?: string,
		tags?: string[],
		coverImage?: string
	) => Promise<Note | null | undefined>
	renameItem: (id: string, newName: string) => Promise<Item | null | undefined>
	deleteItem: (id: string) => Promise<boolean>
	moveItem: (itemId: string, targetFolderId: string | null) => Promise<Item | null | undefined>
	countChildren: (folderId: string) => Promise<number>
	pinItem: (
		itemId: string,
		itemType: 'note' | 'folder',
		pinned: boolean
	) => Promise<Item | null | undefined>
	favoriteNote: (noteId: string, favorite: boolean) => Promise<Note | null | undefined>
	setNoteVisibility: (noteId: string, isPublic: boolean) => Promise<Note | null | undefined>
	refreshItems: () => Promise<void>
	duplicateNote: (noteId: string, newName?: string) => Promise<Note>
}
const NotesContext = createContext<NotesContextValue | null>(null)

export function NotesProvider({ children }: { children: ReactNode }) {
	const notesState = useNotes()
	useGuestMigration()

	return <NotesContext.Provider value={notesState}>{children}</NotesContext.Provider>
}

export function useNotesContext() {
	const context = useContext(NotesContext)
	if (!context) {
		throw new Error('useNotesContext must be used within a NotesProvider')
	}
	return context
}
