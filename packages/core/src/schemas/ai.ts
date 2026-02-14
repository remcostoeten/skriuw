import { z } from 'zod'
import { AI_DEFAULT_TEMPERATURE, AI_MAX_TEMPERATURE, AI_MIN_TEMPERATURE } from '../rules'

export const AIProviderSchema = z.enum(['gemini', 'grok'])

export const AIModelSchema = z.string().trim().min(1)

export const AIConfigCreateSchema = z.object({
	provider: AIProviderSchema,
	model: AIModelSchema,
	basePrompt: z.string().optional().nullable(),
	temperature: z
		.number()
		.int()
		.min(AI_MIN_TEMPERATURE)
		.max(AI_MAX_TEMPERATURE)
		.default(AI_DEFAULT_TEMPERATURE)
})

export const AIConfigPatchSchema = z
	.object({
		provider: AIProviderSchema.optional(),
		model: AIModelSchema.optional(),
		basePrompt: z.string().optional().nullable(),
		temperature: z.number().int().min(AI_MIN_TEMPERATURE).max(AI_MAX_TEMPERATURE).optional()
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: 'At least one field must be provided'
	})

export const AIConfigResponseSchema = z.object({
	id: z.string().min(1),
	provider: AIProviderSchema,
	model: AIModelSchema,
	basePrompt: z.string().nullable(),
	temperature: z.number().int().min(AI_MIN_TEMPERATURE).max(AI_MAX_TEMPERATURE),
	isActive: z.boolean()
})

export const AIPromptRequestSchema = z.object({
	prompt: z.string().trim().min(1),
	isTest: z.boolean().optional(),
	configId: z.string().min(1).optional()
})

export const AIPromptResponseSchema = z.object({
	content: z.string(),
	tokensUsed: z.number().int().nonnegative(),
	provider: AIProviderSchema,
	model: AIModelSchema
})

export const AIUsageResponseSchema = z.object({
	promptsUsedToday: z.number().int().nonnegative(),
	promptsRemaining: z.number().int().nonnegative(),
	resetAt: z.number().int().nonnegative()
})

export type AIProvider = z.infer<typeof AIProviderSchema>
export type AIConfigCreateInput = z.infer<typeof AIConfigCreateSchema>
export type AIConfigPatchInput = z.infer<typeof AIConfigPatchSchema>
export type AIConfigResponse = z.infer<typeof AIConfigResponseSchema>
export type AIPromptRequest = z.infer<typeof AIPromptRequestSchema>
export type AIPromptResponse = z.infer<typeof AIPromptResponseSchema>
export type AIUsageResponse = z.infer<typeof AIUsageResponseSchema>
