import { auth } from "@/lib/auth"
import { getDatabase } from "@skriuw/db"
import { aiPromptLog } from "@skriuw/db/src/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { checkRateLimit } from "@/features/ai/utilities"

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = getDatabase()
    const allPrompts = await db
        .select({ createdAt: aiPromptLog.createdAt })
        .from(aiPromptLog)
        .where(eq(aiPromptLog.userId, session.user.id))

    const timestamps = allPrompts.map((p) => p.createdAt)
    const { promptsUsed, promptsRemaining, resetAt } = checkRateLimit(timestamps)

    return NextResponse.json({
        promptsUsedToday: promptsUsed,
        promptsRemaining,
        resetAt
    })
}
