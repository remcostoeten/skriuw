import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/storage/adapters/server-db'
import { requireAuth } from '../../../lib/api-auth'
import { getSafeTimestamp } from '@skriuw/db'

/**
 * Generates a user-specific settings key.
 */
function getSettingsKey(userId: string): string {
	return `settings-${userId}`
}

export async function GET() {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const settingsKey = getSettingsKey(userId)
		const result = await db.findById('settings', settingsKey, userId)
		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to load settings:', error)
		return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const settingsKey = getSettingsKey(userId)
		const body = await request.json()
		const now = getSafeTimestamp()

		const data = {
			id: settingsKey,
			key: settingsKey,
			value: body?.settings ?? {},
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.upsert('settings', data, userId)
		return NextResponse.json(result, { status: 201 })
	} catch (error) {
		console.error('Failed to save settings:', error)
		return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
	}
}

export async function PUT(request: NextRequest) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const settingsKey = getSettingsKey(userId)
		const body = await request.json()
		const now = getSafeTimestamp()

		const data = {
			id: settingsKey,
			key: settingsKey,
			value: body?.settings ?? {},
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.upsert('settings', data, userId)
		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to update settings:', error)
		return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
	}
}

export async function DELETE() {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const settingsKey = getSettingsKey(userId)
		await db.delete('settings', settingsKey, userId)
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to delete settings:', error)
		return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 })
	}
}
