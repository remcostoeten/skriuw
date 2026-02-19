// ============================================================================
// SHARED ROUTE TYPES FOR apps/api
// Self-contained copies of the Note/Folder/Item types from apps/web.
// Kept here to avoid cross-app imports. Must stay in sync with
// apps/web/features/notes/types/index.ts
// ============================================================================

export type UUID = string
export type Timestamp = number
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NoteContent = any[]

export type BaseEntity = {
	id: UUID
	createdAt?: Timestamp
	updatedAt?: Timestamp
}

export type Note = BaseEntity & {
	/** Display name or title of note */
	name: string
	/** Rich text content blocks (BlockNote format) */
	content: NoteContent
	/** Emoji icon for the note */
	icon?: string | null
	/** Cover image URL for the note */
	coverImage?: string | null
	/** Tags for categorization */
	tags?: string[]
	/** ID of the parent folder, if any */
	parentFolderId?: UUID | null
	/** Whether the note is pinned to the top of lists */
	pinned?: boolean
	/** Timestamp when the note was pinned */
	pinnedAt?: Timestamp
	/** Whether the note is marked as a favorite */
	favorite?: boolean
	/** Whether the note is publicly accessible */
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

export type Folder = BaseEntity & {
	/** Display name of folder */
	name: string
	/** Discriminator type literal */
	type: 'folder'
	/** Nested items (notes or subfolders) */
	children: Item[]
	/** ID of the parent folder, if any */
	parentFolderId?: UUID | null
	/** Whether the folder is pinned */
	pinned?: boolean
	/** Timestamp when the folder was pinned */
	pinnedAt?: Timestamp
	/** User ID who owns this folder */
	userId?: UUID
}

/**
 * Union type representing either a Note or a Folder.
 * Useful for tree rendering and mixed lists.
 */
export type Item = Note | Folder
