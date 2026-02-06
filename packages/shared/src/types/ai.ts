export type AIProvider = 'gemini' | 'grok'

export type GeminiModel =
	| 'gemini-2.5-pro'
	| 'gemini-2.5-flash'
	| 'gemini-3-pro'
	| 'gemini-3-flash'
	| 'gemini-3.5-pro'
	| 'gemini-3.5-flash'

export type GrokModel = 'grok-4' | 'grok-4-fast' | 'grok-free'

export type AIModel = GeminiModel | GrokModel

export type AIProviderConfig = {
	id: string
	provider: AIProvider
	model: AIModel
	basePrompt: string | null
	temperature: number
	isActive: boolean
}

export type AIPromptRequest = {
	prompt: string
	configId?: string
}

export type AIPromptResponse = {
	content: string
	tokensUsed: number
	provider: AIProvider
	model: AIModel
}

export type AIUsageStats = {
	promptsUsedToday: number
	promptsRemaining: number
	resetAt: number
}

export type ProviderSendConfig = {
	model: AIModel
	temperature: number
	apiKey: string
	basePrompt?: string
}

export type ProviderAdapter = {
	name: AIProvider
	sendPrompt(prompt: string, config: ProviderSendConfig): Promise<AIPromptResponse>
	validateApiKey(apiKey: string): Promise<boolean>
	listModels(): AIModel[]
}

export const GEMINI_MODELS: GeminiModel[] = [
	'gemini-2.5-pro',
	'gemini-2.5-flash',
	'gemini-3-pro',
	'gemini-3-flash',
	'gemini-3.5-pro',
	'gemini-3.5-flash'
]

export const GROK_MODELS: GrokModel[] = ['grok-4', 'grok-4-fast', 'grok-free']

export const AI_PROVIDERS: AIProvider[] = ['gemini', 'grok']

export const DAILY_PROMPT_LIMIT = 3

export function getModelsForProvider(provider: AIProvider): AIModel[] {
	switch (provider) {
		case 'gemini':
			return GEMINI_MODELS
		case 'grok':
			return GROK_MODELS
	}
}

export function getDefaultModelForProvider(provider: AIProvider): AIModel {
	switch (provider) {
		case 'gemini':
			return 'gemini-3-flash'
		case 'grok':
			return 'grok-free'
	}
}
