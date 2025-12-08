// apps/web/features/ai/core/service.ts
// AiService singleton – wraps Vercel AI SDK generateText/streamText with Zod validation
// and optional fallback/retry logic for rate‑limit errors.

import { generateText, streamText } from 'ai'
import { AiGenerateSchema, AiChatSchema } from './validation.js'
import { getGlobalProvider } from '../config'

// Simple retry helper for rate‑limit (429) – tries next fallback provider if available.
async function retryWithFallback<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
	try {
		return await fn()
	} catch (err: any) {
		if (attempts > 0 && err?.status === 429) {
			// In a real implementation you would switch to a backup key/provider here.
			// For now we just re‑throw after exhausting attempts.
			return retryWithFallback(fn, attempts - 1)
		}
		throw err
	}
}

export class AiService {
	private static _instance: AiService | null = null
	private provider = getGlobalProvider() // Provider resolved from config / env / settings

	private constructor() {}

	static get instance(): AiService {
		if (!AiService._instance) {
			AiService._instance = new AiService()
		}
		return AiService._instance
	}

	/** Generate a single response (non‑streaming) */
	async generate(opts: { prompt: string; model?: string; options?: any }) {
		// Validate input with Zod
		const parsed = AiGenerateSchema.parse(opts)
		const model = parsed.model ? (this.provider as any)(parsed.model) : undefined
		return retryWithFallback(() =>
			generateText({
				model,
				prompt: parsed.prompt,
				...parsed.options,
			})
		) as any
	}

	/** Stream a chat conversation – used by BlockNote AI */
	async chat(opts: { messages: any[]; toolDefinitions?: any[] }) {
		// Validate chat payload
		const parsed = AiChatSchema.parse(opts)
		return retryWithFallback(async () => {
			const result = await streamText({
				// model is resolved from global provider (default) – can be overridden per message if needed
				model: (globalThis as any).AI_SDK_DEFAULT_PROVIDER?.('google/gemini-1.5-flash'),
				messages: parsed.messages,
				tools: parsed.toolDefinitions
					? (globalThis as any).toolDefinitionsToToolSet?.(parsed.toolDefinitions)
					: undefined,
				includeRawChunks: true,
			})
			return result
		})
	}
}

// Export a ready‑to‑use singleton instance for convenience
export const aiService = AiService.instance
