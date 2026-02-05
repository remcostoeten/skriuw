import { requireAuth } from '../../../lib/api-auth'
import { db } from '../../../lib/storage/adapters/server-db'
import {
	decryptConnectorStates,
	encryptConnectorStates
} from '@/features/backup/core/connector-secrets'
import { getSafeTimestamp } from '@skriuw/db'
import { NextRequest, NextResponse } from 'next/server'

type SettingsRecord = {
	id: string
	key: string
	value: Record<string, any>
	userId?: string | null
	createdAt: number
	updatedAt: number
}

/**
 * Generates a user-specific settings key.
 */
function getSettingsKey(userId: string): string {
	return `settings-${userId}`
}

export async function GET() {
	try {
		const auth = await requireAuth()
		// Return empty settings for unauthenticated users instead of 401
		if (!auth.authenticated) {
			return NextResponse.json(null)
		}
		const { userId } = auth

		const settingsKey = getSettingsKey(userId)
		const result = await db.findById<SettingsRecord>('settings', settingsKey, userId)
		// Decrypt storage connectors before returning to the client
		if (result && result.value?.storageConnectors) {
			try {
				const decrypted = decryptConnectorStates(result.value.storageConnectors)
				return NextResponse.json({
					...result,
					value: { ...result.value, storageConnectors: decrypted }
				})
			} catch (decryptError) {
				console.error('Failed to decrypt storage connectors:', decryptError)
				return NextResponse.json(
					{ error: 'Failed to load storage connectors' },
					{ status: 500 }
				)
			}
		}

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

		// Encrypt storage connectors before persistence
		const rawSettings = body?.settings ?? {}
		const encryptedSettings = {
			...rawSettings,
			storageConnectors: rawSettings.storageConnectors
				? encryptConnectorStates(rawSettings.storageConnectors)
				: undefined
		}

		const data = {
			id: settingsKey,
			key: settingsKey,
			value: encryptedSettings,
			createdAt: now,
			updatedAt: now
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

		// Encrypt storage connectors before persistence
		const rawSettings = body?.settings ?? {}
		const encryptedSettings = {
			...rawSettings,
			storageConnectors: rawSettings.storageConnectors
				? encryptConnectorStates(rawSettings.storageConnectors)
				: undefined
		}

		const data = {
			id: settingsKey,
			key: settingsKey,
			value: encryptedSettings,
			createdAt: now,
			updatedAt: now
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
