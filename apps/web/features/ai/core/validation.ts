import { z } from 'zod'

export const AiGenerateSchema = z.object({
	// Prompt sent to the LLM
	prompt: z.string().min(1).max(10000),
	// Optional model identifier (e.g., "google/gemini-1.5-flash")
	model: z.string().optional(),
	// Additional generation options
	options: z.object({
		temperature: z.number().min(0).max(2).optional(),
		maxTokens: z.number().int().positive().optional(),
		// Add more SDK options as needed
	}).optional(),
});

export const AiChatSchema = z.object({
	// Array of UIMessage objects – we keep it generic here
	messages: z.array(z.any()),
	// Optional tool definitions for BlockNote AI
	toolDefinitions: z.array(z.any()).optional(),
});
