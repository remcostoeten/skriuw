import { z } from 'zod'
import { MAX_NOTE_NAME_LENGTH } from '../rules'

const TimestampSchema = z.number().int().nonnegative()

export const NoteTypeSchema = z.enum(['note', 'folder'])

export const CreateNoteSchema = z.object({
	name: z.string().trim().min(1).max(MAX_NOTE_NAME_LENGTH),
	type: NoteTypeSchema.optional().default('note'),
	content: z.unknown().optional(),
	parentFolderId: z.string().min(1).nullable().optional(),
	icon: z.string().min(1).optional(),
	coverImage: z.string().min(1).optional(),
	tags: z.array(z.string()).optional(),
	pinned: z.boolean().optional(),
	favorite: z.boolean().optional(),
	isPublic: z.boolean().optional()
})

export const UpdateNoteSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1).max(MAX_NOTE_NAME_LENGTH).optional(),
	content: z.unknown().optional(),
	parentFolderId: z.string().min(1).nullable().optional(),
	icon: z.string().min(1).optional(),
	coverImage: z.string().min(1).optional(),
	tags: z.array(z.string()).optional(),
	pinned: z.boolean().optional(),
	pinnedAt: TimestampSchema.nullable().optional(),
	favorite: z.boolean().optional(),
	isPublic: z.boolean().optional(),
	publicId: z.string().min(1).nullable().optional(),
	publicViews: z.number().int().nonnegative().optional(),
	updatedAt: TimestampSchema.optional()
})

export const NoteResponseSchema = z.object({
	id: z.string().min(1),
	type: z.literal('note'),
	name: z.string(),
	content: z.unknown().optional(),
	parentFolderId: z.string().nullable().optional(),
	icon: z.string().optional(),
	coverImage: z.string().optional(),
	tags: z.array(z.string()).optional(),
	pinned: z.boolean().optional(),
	pinnedAt: TimestampSchema.nullable().optional(),
	favorite: z.boolean().optional(),
	isPublic: z.boolean().optional(),
	publicId: z.string().nullable().optional(),
	publicViews: z.number().int().nonnegative().optional(),
	userId: z.string().nullable().optional(),
	createdAt: TimestampSchema.optional(),
	updatedAt: TimestampSchema.optional()
})

export const FolderResponseSchema = z.object({
	id: z.string().min(1),
	type: z.literal('folder'),
	name: z.string(),
	parentFolderId: z.string().nullable().optional(),
	pinned: z.boolean().optional(),
	pinnedAt: TimestampSchema.nullable().optional(),
	userId: z.string().nullable().optional(),
	createdAt: TimestampSchema.optional(),
	updatedAt: TimestampSchema.optional(),
	children: z.array(z.unknown()).optional()
})

export const NoteOrFolderResponseSchema = z.union([NoteResponseSchema, FolderResponseSchema])

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>
export type NoteResponse = z.infer<typeof NoteResponseSchema>
export type FolderResponse = z.infer<typeof FolderResponseSchema>
export type NoteOrFolderResponse = z.infer<typeof NoteOrFolderResponseSchema>
