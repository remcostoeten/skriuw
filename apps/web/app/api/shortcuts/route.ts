import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/storage/adapters/server-db'
import { allowReadAccess, requireMutation } from '../../../lib/api-auth'

export async function GET(request: NextRequest) {
	try {
		// Use session-based auth only - no user impersonation via query params
		const userId = await allowReadAccess()

		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (id) {
			const result = await db.findById('shortcuts', id, userId)
			if (!result) return NextResponse.json(null, { status: 404 })
			return NextResponse.json(result)
		}

		const all = await db.findAll('shortcuts', userId)
		return NextResponse.json(all)
	} catch (error) {
		console.error('Failed to load shortcuts:', error)
		return NextResponse.json({ error: 'Failed to load shortcuts' }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
	try {
		// Require authentication for mutations - no guest access
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response

		const body = await request.json()
		if (!body?.id) return NextResponse.json({ error: 'Shortcut id is required' }, { status: 400 })

		const now = Date.now()
		const customizedAt = typeof body.customizedAt === 'string' ? Date.parse(body.customizedAt) : now

		const data = {
			id: body.id,
			keys: Array.isArray(body.keys) ? body.keys : [],
			customizedAt: Number.isNaN(customizedAt) ? now : customizedAt,
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.upsert('shortcuts', data, auth.userId)
		return NextResponse.json(result, { status: 201 })
	} catch (error) {
		console.error('Failed to save shortcut:', error)
		return NextResponse.json({ error: 'Failed to save shortcut' }, { status: 400 })
	}
}

export async function PUT(request: NextRequest) {
	try {
		// Require authentication for mutations - no guest access
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response

		const body = await request.json()
		if (!body?.id) return NextResponse.json({ error: 'Shortcut id is required' }, { status: 400 })

		const now = Date.now()
		const customizedAt = typeof body.customizedAt === 'string' ? Date.parse(body.customizedAt) : now

		const data = {
			id: body.id,
			keys: Array.isArray(body.keys) ? body.keys : [],
			customizedAt: Number.isNaN(customizedAt) ? now : customizedAt,
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.upsert('shortcuts', data, auth.userId)
		return NextResponse.json(result)
	} catch (error) {
		console.error('Failed to update shortcut:', error)
		return NextResponse.json({ error: 'Failed to update shortcut' }, { status: 400 })
	}
}

export async function DELETE(request: NextRequest) {
	try {
		// Require authentication for mutations - no guest access
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response

		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) return NextResponse.json({ error: 'Shortcut id is required' }, { status: 400 })

		await db.delete('shortcuts', id, auth.userId)
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Failed to delete shortcut:', error)
		return NextResponse.json({ error: 'Failed to delete shortcut' }, { status: 500 })
	}
}
