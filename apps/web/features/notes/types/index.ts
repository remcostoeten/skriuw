import type { Block } from '@blocknote/core'

export interface Note {
	id: string
	name: string
	content: Block[]
	parentFolderId?: string
	pinned?: boolean
	pinnedAt?: number
	favorite?: boolean
	createdAt: number
	updatedAt: number
	type: 'note'
}

export interface Folder {
	id: string
	name: string
	type: 'folder'
	children: (Note | Folder)[]
	parentFolderId?: string
	pinned?: boolean
	pinnedAt?: number
	createdAt: number
	updatedAt: number
}

export type Item = Note | Folder

export interface CreateNoteData {
	name: string
	content?: Block[]
	parentFolderId?: string
}

export interface UpdateNoteData {
	name?: string
	content?: Block[]
}

export interface CreateFolderData {
	name: string
	parentFolderId?: string
}
