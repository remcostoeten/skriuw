import type { Task } from '../../tasks/api/queries/get-tasks'
import type { Block } from '@blocknote/core'

// Define types locally since shared package build is failing
type UUID = string
type Timestamp = number

type BaseEntity = {
	id: UUID
} & {
	createdAt: Timestamp
	updatedAt: Timestamp
	deletedAt?: Timestamp
}

type NoteContent = Block[]

/**
 * Represents a single note entity in system.
 * Contains rich text content and metadata.
 */
export type Note = BaseEntity & {
	/** Display name or title of note */
	name: string
	/** Rich text content blocks (BlockNote format) */
	content: NoteContent
	/** Emoji icon for the note */
	icon?: string
	/** Cover image URL for the note */
	coverImage?: string
	/** Tags for categorization */
	tags?: string[]
	/** ID of the parent folder, if any */
	parentFolderId?: UUID
	/** Whether is note is pinned to the top of lists */
	pinned?: boolean
	/** Timestamp when is note was pinned */
	pinnedAt?: Timestamp
	/** Whether is note is marked as a favorite */
	favorite?: boolean
	/** Whether is note is publicly accessible */
	isPublic?: boolean
	/** Public share identifier */
	publicId?: string | null
	/** Unique visitor count */
	publicViews?: number
	/** User ID who owns this note */
	userId?: UUID
	/** Discriminator type literal */
	type: 'note'
}

/**
 * Represents a folder that can contain notes and other folders.
 * Used for hierarchical organization.
 */
export type Folder = BaseEntity & {
	/** Display name of folder */
	name: string
	/** Discriminator type literal */
	type: 'folder'
	/** Nested items (notes or subfolders) */
	children: (Note | Folder)[]
	/** ID of the parent folder, if any */
	parentFolderId?: UUID
	/** Whether is folder is pinned */
	pinned?: boolean
	/** Timestamp when is folder was pinned */
	pinnedAt?: Timestamp
	/** User ID who owns this folder */
	userId?: UUID
}

/**
 * Union type representing either a Note or a Folder.
 * Useful for tree rendering and mixed lists.
 */
export type Item = Note | Folder

/**
 * Payload for creating a new note.
 */
export type CreateNoteData = {
	/** Title of the new note */
	name: string
	/** Optional initial content blocks */
	content?: NoteContent
	/** Optional ID of the parent folder */
	parentFolderId?: UUID
}

/**
 * Payload for updating an existing note.
 */
export type UpdateNoteData = {
	/** New title for the note */
	name?: string
	/** New content blocks */
	content?: NoteContent
	/** Emoji icon */
	icon?: string
	/** Cover image URL */
	coverImage?: string
	/** Tags for categorization */
	tags?: string[]
	/** Toggle public visibility */
	isPublic?: boolean
}

/**
 * Payload for creating a new folder.
 */
export type CreateFolderData = {
	/** Name of the new folder */
	name: string
	/** Optional ID of the parent folder */
	parentFolderId?: UUID
}

/**
 * Payload for dragging a note tab.
 */
export type NoteTabDragPayload = {
	noteId: string
	sourcePaneId: string | null
}
