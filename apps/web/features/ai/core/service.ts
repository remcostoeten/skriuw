// apps/web/features/ai/core/service.ts
// AiService singleton – wraps Vercel AI SDK generateText/streamText with Zod validation
// and optional fallback/retry logic for rate‑limit errors.

import { generateText, streamText } from "ai";
import { toolDefinitionsToToolSet } from "@blocknote/xl-ai/server";
import { AiGenerateSchema, AiChatSchema } from "./validation";
import { getGlobalProvider } from "../config";
import { z } from "zod";

// Simple retry helper for rate‑limit (429) – tries next fallback provider if available.
async function retryWithFallback<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
    try {
        return await fn();
    } catch (err: any) {
        if (attempts > 0 && err?.status === 429) {
            // In a real implementation you would switch to a backup key/provider here.
            // For now we just re‑throw after exhausting attempts.
            return retryWithFallback(fn, attempts - 1);
        }
        throw err;
    }
}

export class AiService {
    private static _instance: AiService | null = null;
    private provider = getGlobalProvider(); // Provider resolved from config / env / settings

    private constructor() { }

    static get instance(): AiService {
        if (!AiService._instance) {
            AiService._instance = new AiService();
        }
        return AiService._instance;
    }

    /** Generate a single response (non‑streaming) */
    async generate(opts: { prompt: string; model?: string; options?: any }) {
        // Validate input with Zod
        const parsed = AiGenerateSchema.parse(opts);
            const modelName = parsed.model || "google/gemini-1.5-flash";
        return retryWithFallback(() =>
            generateText({
                model: modelName,
                prompt: parsed.prompt,
                ...parsed.options,
            })
        );
    }

    /** Stream a chat conversation – used by BlockNote AI */
    async chat(opts: { messages: any[]; toolDefinitions?: any[] }) {
        // Validate chat payload
        const parsed = AiChatSchema.parse(opts);
          const result = await retryWithFallback(async () => {
            const streamResult = streamText({
                model: "google/gemini-1.5-flash",
                messages: parsed.messages,
                tools: parsed.toolDefinitions ? toolDefinitionsToToolSet(parsed.toolDefinitions as any) : undefined,
                includeRawChunks: true,
            });
            return streamResult;
        });
        return result;
    }
}

// Export a ready‑to‑use singleton instance for convenience
export const aiService = AiService.instance;
