import { z } from 'zod'
import { IMPORT_MAX_ITEMS } from '../rules'

const TimestampSchema = z.number().int().nonnegative()

const ImportItemBaseSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1),
	pinned: z.union([z.boolean(), z.number(), z.string()]).optional(),
	pinnedAt: TimestampSchema.nullable().optional(),
	createdAt: TimestampSchema.optional(),
	updatedAt: TimestampSchema.optional(),
	parentFolderId: z.string().nullable().optional()
})

export const ImportItemSchema: z.ZodType<any> = z.lazy(() =>
	z.union([
		ImportItemBaseSchema.extend({
			type: z.literal('note'),
			content: z.unknown().optional(),
			favorite: z.union([z.boolean(), z.number(), z.string()]).optional()
		}),
		ImportItemBaseSchema.extend({
			type: z.literal('folder'),
			children: z.array(ImportItemSchema).optional()
		})
	])
)

export const ImportPayloadSchema = z.object({
	items: z.array(ImportItemSchema).max(IMPORT_MAX_ITEMS)
})

export type ImportItem = z.infer<typeof ImportItemSchema>
export type ImportPayload = z.infer<typeof ImportPayloadSchema>
