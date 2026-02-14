import { requireAuth } from '@/lib/api-auth'
import { getDatabase } from '@skriuw/db'
import { aiPromptLog } from '@skriuw/db/src/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/features/ai/utilities'

export async function GET() {
	const auth = await requireAuth()
	if (!auth.authenticated) return auth.response
	const { userId } = auth

	const db = getDatabase()
	const allPrompts = await db
		.select({ createdAt: aiPromptLog.createdAt })
		.from(aiPromptLog)
		.where(eq(aiPromptLog.userId, userId))

	const timestamps = allPrompts.map((p) => p.createdAt)
	const { promptsUsed, promptsRemaining, resetAt } = checkRateLimit(timestamps)

	return NextResponse.json({
		promptsUsedToday: promptsUsed,
		promptsRemaining,
		resetAt
	})
}
