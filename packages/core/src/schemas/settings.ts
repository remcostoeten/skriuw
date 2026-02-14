import { z } from 'zod'

const TimestampSchema = z.number().int().nonnegative()

export const SettingsValueSchema = z.record(z.string(), z.unknown())

export const SettingsUpsertSchema = z.object({
	settings: SettingsValueSchema.default({})
})

export const SettingsRecordSchema = z.object({
	id: z.string().min(1),
	key: z.string().min(1),
	value: SettingsValueSchema,
	userId: z.string().nullable().optional(),
	createdAt: TimestampSchema,
	updatedAt: TimestampSchema
})

export type SettingsValue = z.infer<typeof SettingsValueSchema>
export type SettingsUpsertInput = z.infer<typeof SettingsUpsertSchema>
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>
