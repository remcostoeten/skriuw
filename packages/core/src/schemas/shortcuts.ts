import { z } from 'zod'
import { MAX_SHORTCUT_COMBOS, MAX_SHORTCUT_KEYS_PER_COMBO } from '../rules'

const TimestampSchema = z.number().int().nonnegative()

export const KeyComboSchema = z.array(z.string().min(1)).min(1).max(MAX_SHORTCUT_KEYS_PER_COMBO)

export const ShortcutUpsertSchema = z.object({
	id: z.string().min(1),
	keys: z.array(KeyComboSchema).max(MAX_SHORTCUT_COMBOS),
	customizedAt: z.union([TimestampSchema, z.string().min(1)]).optional()
})

export const ShortcutResponseSchema = z.object({
	id: z.string().min(1),
	keys: z.array(KeyComboSchema),
	userId: z.string().nullable().optional(),
	customizedAt: TimestampSchema,
	createdAt: TimestampSchema,
	updatedAt: TimestampSchema
})

export type KeyCombo = z.infer<typeof KeyComboSchema>
export type ShortcutUpsertInput = z.infer<typeof ShortcutUpsertSchema>
export type ShortcutResponse = z.infer<typeof ShortcutResponseSchema>
