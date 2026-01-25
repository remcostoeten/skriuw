import { auth } from "@/lib/auth"
import { getDatabase } from "@skriuw/db"
import { aiPromptLog, aiProviderConfig, aiApiKeys } from "@skriuw/db/src/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { type AIProvider } from "@/features/ai/types"
import { getProvider } from "@/features/ai/providers"
import { hashPrompt, decryptPrompt, selectApiKey, checkRateLimit } from "@/features/ai/utilities"
import { decryptSecret } from "@/lib/crypto/secret"
import { env } from "@/lib/env"

export async function POST(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, isTest } = body

    if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const now = Date.now()
    const db = getDatabase()

    const allPrompts = await db
        .select({ createdAt: aiPromptLog.createdAt })
        .from(aiPromptLog)
        .where(eq(aiPromptLog.userId, session.user.id))

    const rateLimitResult = checkRateLimit(allPrompts.map((p) => p.createdAt), now)

    if (!isTest && !rateLimitResult.allowed) {
        return NextResponse.json(
            { error: 'Daily prompt limit reached', code: 'RATE_LIMIT' },
            { status: 429 }
        )
    }

    const configs = await db
        .select()
        .from(aiProviderConfig)
        .where(eq(aiProviderConfig.userId, session.user.id))
        .limit(1)

    const config = configs[0]
    const provider: AIProvider = (config?.provider as AIProvider) || 'gemini'
    const model = config?.model || 'gemini-3-flash'
    const temperature = config?.temperature ?? 70
    const basePrompt = config?.basePrompt || undefined

    const providerKeys = await db
        .select()
        .from(aiApiKeys)
        .where(and(eq(aiApiKeys.provider, provider), eq(aiApiKeys.isActive, true)))
    const keySelection = selectApiKey(providerKeys, provider, now)

    let apiKey: string

    if (keySelection.key) {
        apiKey = decryptSecret(keySelection.key.encryptedKey)
    } else {
        const envKey = provider === 'gemini'
            ? (env.GEMINI_API_KEY || env.GEMINI_BACKUP_KEY)
            : (env.GROK_API_KEY || env.GROK_BACKUP_KEY)

        if (!envKey) {
            return NextResponse.json(
                { error: `No API key available for ${provider}`, code: 'NO_API_KEY' },
                { status: 503 }
            )
        }
        apiKey = envKey
    }

    const providerAdapter = getProvider(provider)

    try {
        const response = await providerAdapter.sendPrompt(prompt, {
            model: model as Parameters<typeof providerAdapter.sendPrompt>[1]['model'],
            temperature,
            apiKey,
            basePrompt: basePrompt ? decryptPrompt(basePrompt) : undefined
        })

        if (!isTest) {
            await db.insert(aiPromptLog).values({
                id: crypto.randomUUID(),
                userId: session.user.id,
                provider,
                model,
                tokensUsed: response.tokensUsed,
                promptHash: hashPrompt(prompt),
                createdAt: now
            })

            if (keySelection.key) {
                await db
                    .update(aiApiKeys)
                    .set({
                        usageCount: keySelection.key.usageCount + 1,
                        lastUsedAt: now,
                        updatedAt: now
                    })
                    .where(eq(aiApiKeys.id, keySelection.key.id))
            }
        }

        return NextResponse.json(response)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const isRateLimitedError =
            message.includes('429') || message.toLowerCase().includes('rate limit')

        if (isRateLimitedError && keySelection.key) {
            await db
                .update(aiApiKeys)
                .set({
                    rateLimitedUntil: now + 60 * 60 * 1000,
                    updatedAt: now
                })
                .where(eq(aiApiKeys.id, keySelection.key.id))
        }

        console.error('[AI_PROMPT_ROUTE] Provider error', {
            error,
            keyId: keySelection.key?.id
        })

        return NextResponse.json(
            isRateLimitedError
                ? { error: 'The AI provider is currently rate limiting requests. Please try again later.', code: 'PROVIDER_RATE_LIMITED' }
                : { error: 'An error occurred while calling the AI provider.', code: 'PROVIDER_ERROR' },
            { status: isRateLimitedError ? 429 : 502 }
        )
    }
}
