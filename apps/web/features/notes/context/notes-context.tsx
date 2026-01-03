'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useNotes } from '../hooks/use-notes'
import type { Item, Note, Folder } from '../types'
import type { Block } from '@blocknote/core'

type NotesContextValue = {
	items: Item[]
	isInitialLoading: boolean
	isRefreshing: boolean
	getNote: (id: string) => Promise<Note | undefined>
	getItem: (id: string) => Promise<Item | undefined>
	createNote: (name?: string, content?: string | Block[], parentFolderId?: string) => Promise<Note>
	createFolder: (name?: string, parentFolderId?: string) => Promise<Folder>
	updateNote: (id: string, content: Block[], name?: string) => Promise<void>
	renameItem: (id: string, newName: string) => Promise<void>
	deleteItem: (id: string) => Promise<boolean>
	moveItem: (itemId: string, targetFolderId: string | null) => Promise<boolean>
	countChildren: (folderId: string) => Promise<number>
	pinItem: (itemId: string, itemType: 'note' | 'folder', pinned: boolean) => Promise<void>
	favoriteNote: (noteId: string, favorite: boolean) => Promise<void>
	setNoteVisibility: (noteId: string, isPublic: boolean) => Promise<void>
	refreshItems: () => Promise<void>
}

const NotesContext = createContext<NotesContextValue | null>(null)

export function NotesProvider({ children }: { children: ReactNode }) {
	const notesState = useNotes()

	return <NotesContext.Provider value={notesState}>{children}</NotesContext.Provider>
}

export function useNotesContext() {
	const context = useContext(NotesContext)
	if (!context) {
		throw new Error('useNotesContext must be used within a NotesProvider')
	}
	return context
}
