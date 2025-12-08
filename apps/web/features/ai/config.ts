// apps/web/features/ai/config.ts
// Global AI provider configuration for Vercel AI SDK 5
// This file sets up a default provider that can be overridden by user settings.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Provider } from "ai";

// Helper to read a setting value – replace with your actual settings accessor.
// For now we assume a synchronous function that returns a string or undefined.
function getSetting(key: string): string | undefined {
	// TODO: replace with actual settings retrieval (e.g., from DB or context)
	return undefined;
}

// Resolve the provider based on user setting or fallback to system env vars.
export function getGlobalProvider(): Provider {
	// 1. Check if user has explicitly set a provider in settings.
	const userProvider = getSetting("ai.provider");
	const userKey = getSetting("ai.user_key");

	if (userProvider && userKey) {
		// Example: "openai" with an OpenAI compatible key.
		// The model string will be supplied later; we just return the provider.
		return createOpenAI({ apiKey: userKey });
	}

	// 2. Fallback to environment variables for Gemini.
	const geminiKey =
		process.env.GEMINI_KEY ||
		process.env.GEMINI_BACKUP_KEY ||
		process.env.GEMINI_THIRD_BACKUP_KEY;

	if (geminiKey) {
		return createGoogleGenerativeAI({ apiKey: geminiKey });
	}

	// 3. As a last resort, use the Vercel AI SDK default (no key) – this works for
	// providers that allow unauthenticated access in dev mode.
	// The SDK will throw if a key is required, so callers should handle errors.
	return createGoogleGenerativeAI({});
}

// Set the global provider for the SDK (available to all calls).
// This must be executed once at app startup.
export function initGlobalProvider() {
	// The Vercel AI SDK reads `globalThis.AI_SDK_DEFAULT_PROVIDER` if present.
	// We assign the provider instance here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).AI_SDK_DEFAULT_PROVIDER = getGlobalProvider();
}

// Call initGlobalProvider immediately so the provider is ready.
initGlobalProvider();
