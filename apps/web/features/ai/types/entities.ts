import type { BaseEntity } from '@skriuw/shared'
import type { AIProvider, AIModel } from '../types'

/**
 * AI Provider Configuration entity
 * Stores user's preferred AI provider settings
 */
export type AIProviderConfigEntity = BaseEntity & {
	/** User ID who owns this config */
	userId: string
	/** AI provider (gemini, grok) */
	provider: AIProvider
	/** Specific model for the provider */
	model: AIModel
	/** Optional custom system prompt */
	basePrompt: string | null
	/** Temperature setting (0-100) */
	temperature: number
	/** Whether this config is currently active */
	isActive: boolean
}

/**
 * AI Prompt Log entity
 * Tracks AI prompt usage for rate limiting and analytics
 */
export type AIPromptLogEntity = BaseEntity & {
	/** User ID who made the request */
	userId: string
	/** AI provider used */
	provider: AIProvider
	/** Specific model used */
	model: AIModel
	/** Number of tokens consumed */
	tokensUsed: number | null
	/** Hash of the prompt for deduplication */
	promptHash: string
}

/**
 * AI API Key entity
 * Stores API keys for different AI providers
 */
export type AIApiKeyEntity = BaseEntity & {
	/** AI provider this key is for */
	provider: AIProvider
	/** Encrypted API key */
	encryptedKey: string
	/** Priority for key selection (higher = more preferred) */
	priority: number
	/** Number of times this key has been used */
	usageCount: number
	/** Last time this key was used */
	lastUsedAt: number | null
	/** When rate limit expires, if any */
	rateLimitedUntil: number | null
	/** Whether this key is currently active */
	isActive: boolean
}
