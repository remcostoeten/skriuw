import type { Block } from '@blocknote/core'
import type { BaseEntity, UUID } from '@skriuw/shared'

/**
 * Represents a single note entity in the system.
 * Contains the rich text content and metadata.
 */
export type Note = BaseEntity & {
	/** Display name or title of the note */
	name: string
	/** Rich text content blocks (BlockNote format) */
	content: Block[]
	/** ID of the parent folder, if any */
	parentFolderId?: UUID
	/** Whether the note is pinned to the top of lists */
	pinned?: boolean
	/** Timestamp when the note was pinned */
	pinnedAt?: number
	/** Whether the note is marked as a favorite */
	favorite?: boolean
	/** Discriminator type literal */
	type: 'note'
}

/**
 * Represents a folder that can contain notes and other folders.
 * Used for hierarchical organization.
 */
export type Folder = BaseEntity & {
	/** Display name of the folder */
	name: string
	/** Discriminator type literal */
	type: 'folder'
	/** Nested items (notes or subfolders) */
	children: (Note | Folder)[]
	/** ID of the parent folder, if any */
	parentFolderId?: UUID
	/** Whether the folder is pinned */
	pinned?: boolean
	/** Timestamp when the folder was pinned */
	pinnedAt?: number
}

/**
 * Represents a task item, typically embedded within a note or standalone.
 */
export type Task = BaseEntity & {
	/** ID of the note this task belongs to */
	noteId: UUID
	/** ID of the specific block within the note (if applicable) */
	blockId: string
	/** The text content of the task */
	content: string
	/** Optional detailed description */
	description?: string | null
	/** Completion status (0 for unchecked, 1 for checked) */
	checked: number
	/** Optional due date timestamp */
	dueDate?: number | null
	/** ID of the parent task for nested subtasks */
	parentTaskId?: UUID | null
	/** Sort order position */
	position: number
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
	content?: Block[]
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
	content?: Block[]
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
