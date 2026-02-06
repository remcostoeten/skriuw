'use server'

import { getDatabase, settings, eq, and } from '@skriuw/db'

import { decryptSecret } from '@/lib/crypto/secret'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const UPLOAD_KEY_SETTING = 'uploadthing_token'

export async function getUserUploadKey(): Promise<string | null> {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session?.user?.id) {
		return null
	}

	const db = getDatabase()
	const result = await db
		.select()
		.from(settings)
		.where(and(eq(settings.userId, session.user.id), eq(settings.key, UPLOAD_KEY_SETTING)))
		.limit(1)

	if (result.length === 0 || !result[0].value) {
		return null
	}

	try {
		return decryptSecret(result[0].value)
	} catch {
		return null
	}
}
