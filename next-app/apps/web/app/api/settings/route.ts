import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDatabase, settings } from '@quantum-work/db'
import { getSafeTimestamp } from '@quantum-work/db'

const SETTINGS_KEY = 'app-settings'

function deserializeSetting(row: typeof settings.$inferSelect) {
	let parsed: Record<string, any> = {}
	try {
		parsed = JSON.parse(row.value)
	} catch (error) {
		console.warn('Failed to parse settings JSON, returning empty object:', error)
	}

	return {
		id: row.id,
		key: row.key,
		settings: parsed,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export async function GET() {
	try {
		const db = getDatabase()
		const existing = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1)

		if (existing.length === 0) {
			return NextResponse.json(null)
		}

		return NextResponse.json(deserializeSetting(existing[0]))
	} catch (error) {
		console.error('Failed to load settings:', error)
		return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		const db = getDatabase()
		const body = await request.json()
		const settingsPayload = body?.settings ?? {}
		const now = getSafeTimestamp()

		const existing = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1)

		if (existing.length > 0) {
			const [updated] = await db
				.update(settings)
				.set({
					value: JSON.stringify(settingsPayload),
					updatedAt: now,
				})
				.where(eq(settings.id, existing[0].id))
				.returning()

			return NextResponse.json(deserializeSetting(updated))
		}

		const [created] = await db
			.insert(settings)
			.values({
				id: SETTINGS_KEY,
				key: SETTINGS_KEY,
				value: JSON.stringify(settingsPayload),
				createdAt: now,
				updatedAt: now,
			})
			.returning()

		return NextResponse.json(deserializeSetting(created), { status: 201 })
	} catch (error) {
		console.error('Failed to save settings:', error)
		return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
	}
}

export async function DELETE() {
	try {
		const db = getDatabase()
		await db.delete(settings).where(eq(settings.key, SETTINGS_KEY))

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to delete settings:', error)
		return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 })
	}
}
