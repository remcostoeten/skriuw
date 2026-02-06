import type { ProviderAdapter, ProviderSendConfig } from '../types/provider'
import type { AIPromptResponse, GrokModel } from '../types'
import { GROK_MODELS } from '../types'

async function callGrokApi(
	prompt: string,
	config: ProviderSendConfig
): Promise<{ content: string; tokensUsed: number }> {
	const modelName = config.model as GrokModel
	const fullPrompt = config.basePrompt ? `${config.basePrompt}\n\n${prompt}` : prompt

	const response = await fetch('https://api.x.ai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`
		},
		body: JSON.stringify({
			model: modelName,
			messages: [{ role: 'user', content: fullPrompt }],
			temperature: config.temperature / 100
		})
	})

	if (!response.ok) {
		const error = await response.text()
		throw new Error(`Grok API error: ${response.status} - ${error}`)
	}

	const data = await response.json()
	const content = data.choices?.[0]?.message?.content || ''
	const tokensUsed = data.usage?.total_tokens || 0

	return { content, tokensUsed }
}

async function validateGrokApiKey(apiKey: string): Promise<boolean> {
	try {
		const response = await fetch('https://api.x.ai/v1/models', {
			method: 'GET',
			headers: { Authorization: `Bearer ${apiKey}` }
		})
		return response.ok
	} catch {
		return false
	}
}

export const grokProvider: ProviderAdapter = {
	name: 'grok',

	async sendPrompt(prompt: string, config: ProviderSendConfig): Promise<AIPromptResponse> {
		const { content, tokensUsed } = await callGrokApi(prompt, config)
		return {
			content,
			tokensUsed,
			provider: 'grok',
			model: config.model
		}
	},

	validateApiKey: validateGrokApiKey,

	listModels() {
		return [...GROK_MODELS]
	}
}
