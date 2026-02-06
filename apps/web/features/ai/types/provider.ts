import type { AIModel, AIPromptResponse, AIProvider } from './index'

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
