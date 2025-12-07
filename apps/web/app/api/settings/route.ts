import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/storage/adapters/server-db'
import { getSafeTimestamp } from '@skriuw/db'

const SETTINGS_KEY = 'app-settings'

export async function GET() {
	try {
		const result = await db.findById('settings', SETTINGS_KEY)
		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to load settings:', error)
		return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()
		const now = getSafeTimestamp()

		const data = {
			id: SETTINGS_KEY,
			key: SETTINGS_KEY,
			value: body?.settings ?? {},
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.upsert('settings', data)
		return NextResponse.json(result, { status: 201 })
	} catch (error) {
		console.error('Failed to save settings:', error)
		return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
	}
}

export async function PUT(request: NextRequest) {
	try {
		const body = await request.json()
		const now = getSafeTimestamp()

		const data = {
			id: SETTINGS_KEY,
			key: SETTINGS_KEY,
			value: body?.settings ?? {},
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.upsert('settings', data)
		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to update settings:', error)
		return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
	}
}

export async function DELETE() {
	try {
		await db.delete('settings', SETTINGS_KEY)
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to delete settings:', error)
		return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 })
	}
}
