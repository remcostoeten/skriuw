// apps/web/features/ai/api/chat.ts
// Server Action (or API route) handling AI chat requests for BlockNote AI integration.
// It receives a JSON payload with `messages` (array of UIMessage) and optional `toolDefinitions`.
// The route uses the global provider set in `config.ts` and streams the response back to the client.

import { streamText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'

// TODO: Fix BlockNote AI server imports
// import {
//	injectDocumentStateMessages,
//	toolDefinitionsToToolSet,
//	aiDocumentFormats,
// } from '@blocknote/xl-ai/server'

export async function POST(req: NextRequest) {
	try {
		const body = await req.json()
		const { messages, toolDefinitions } = body

		// The global provider is already attached to globalThis.AI_SDK_DEFAULT_PROVIDER by config.ts.
		// We simply call streamText with the model derived from the provider.
		const result = streamText({
			// The provider will be resolved from the global default.
			// If you need to specify a model explicitly, you can pass it here, e.g.:
			// model: "google/gemini-1.5-flash",
			model: (globalThis as any).AI_SDK_DEFAULT_PROVIDER?.('google/gemini-1.5-flash'), // use global provider default
			// TODO: Add system prompt when BlockNote integration is fixed
			// system: aiDocumentFormats.html.systemPrompt,
			messages: messages as any[], // TODO: Fix type when BlockNote integration is working
			tools: toolDefinitions ? toolDefinitions : undefined, // TODO: Fix when BlockNote integration is working
			// Enable raw chunk access for debugging / logging.
			includeRawChunks: true,
		})

		// Return a streaming response compatible with the AI SDK UI components.
		return result.toUIMessageStreamResponse()
	} catch (error) {
		console.error('AI chat route error:', error)
		return NextResponse.json({ error: 'Failed to process AI request' }, { status: 500 })
	}
}
