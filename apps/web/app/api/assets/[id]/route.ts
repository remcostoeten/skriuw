import { NextRequest, NextResponse } from 'next/server'
import { requireMutation } from '@/lib/api-auth'
import { getDatabase, files, eq, and } from '@skriuw/db'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/assets/:id - Rename or toggle visibility
export async function PATCH(request: NextRequest, { params }: RouteParams) {
	try {
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const { id } = await params
		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const body = await request.json()
		const { name, isPublic } = body

		if (name === undefined && isPublic === undefined) {
			return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
		}

		const db = getDatabase()

		// Check ownership
		const [existing] = await db
			.select()
			.from(files)
			.where(and(eq(files.id, id), eq(files.userId, userId)))
			.limit(1)

		if (!existing) {
			return NextResponse.json({ error: 'File not found' }, { status: 404 })
		}

		// Build update object
		const updates: Partial<{ name: string; isPublic: boolean }> = {}
		if (name !== undefined) updates.name = name
		if (isPublic !== undefined) updates.isPublic = isPublic

		// Update the file
		const [updated] = await db
			.update(files)
			.set(updates)
			.where(and(eq(files.id, id), eq(files.userId, userId)))
			.returning()

		return NextResponse.json(updated)
	} catch (error) {
		console.error('PATCH /api/assets/:id error:', error)
		return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
	}
}

// GET /api/assets/:id - Get single asset
export async function GET(request: NextRequest, { params }: RouteParams) {
	try {
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const { id } = await params
		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const db = getDatabase()

		const [file] = await db
			.select()
			.from(files)
			.where(and(eq(files.id, id), eq(files.userId, userId)))
			.limit(1)

		if (!file) {
			return NextResponse.json({ error: 'File not found' }, { status: 404 })
		}

		return NextResponse.json(file)
	} catch (error) {
		console.error('GET /api/assets/:id error:', error)
		return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 500 })
	}
}
