import { auth } from "@/lib/auth"
import { getDatabase } from "@skriuw/db"
import { aiPromptLog } from "@skriuw/db/src/schema"
import { eq, and, gt } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { DAILY_PROMPT_LIMIT } from "@/features/ai/types"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = Date.now()
    const cutoff = now - TWENTY_FOUR_HOURS_MS

    const db = getDatabase()
    const recentPrompts = await db
        .select()
        .from(aiPromptLog)
        .where(
            and(
                eq(aiPromptLog.userId, session.user.id),
                gt(aiPromptLog.createdAt, cutoff)
            )
        )

    const promptsUsedToday = recentPrompts.length
    const promptsRemaining = Math.max(0, DAILY_PROMPT_LIMIT - promptsUsedToday)

    const oldestRecentPrompt = recentPrompts.length > 0
        ? Math.min(...recentPrompts.map((p) => p.createdAt))
        : now

    const resetAt = oldestRecentPrompt + TWENTY_FOUR_HOURS_MS

    return NextResponse.json({
        promptsUsedToday,
        promptsRemaining,
        resetAt
    })
}
