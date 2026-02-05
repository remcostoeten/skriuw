import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";
import { getDatabase, seedTemplateNotes, seedTemplateFolders, eq } from "@skriuw/db";
import { NextRequest, NextResponse } from "next/server";

// Get all seed templates
export async function GET(request: NextRequest) {
	const session = await auth?.api.getSession({ headers: request.headers })
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const db = getDatabase()
	const folders = await db.select().from(seedTemplateFolders).orderBy(seedTemplateFolders.order)
	const notes = await db.select().from(seedTemplateNotes).orderBy(seedTemplateNotes.order)

	return NextResponse.json({ folders, notes })
}

// Create a new seed template (note or folder)
export async function POST(request: NextRequest) {
	const session = await auth?.api.getSession({ headers: request.headers })
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const body = await request.json()
	const { type, name, content, parentFolderId, pinned, order } = body

	if (!name) {
		return NextResponse.json({ error: 'Name is required' }, { status: 400 })
	}

	const db = getDatabase()
	const now = Date.now()
	const id = crypto.randomUUID()

	if (type === 'folder') {
		await db.insert(seedTemplateFolders).values({
			id,
			name,
			parentFolderId: parentFolderId || null,
			order: order ?? 0,
			createdAt: now,
			updatedAt: now
		})
	} else {
		// Default to note
		await db.insert(seedTemplateNotes).values({
			id,
			name,
			content: content || JSON.stringify([]),
			parentFolderId: parentFolderId || null,
			pinned: pinned ?? 0,
			order: order ?? 0,
			createdAt: now,
			updatedAt: now
		})
	}

	return NextResponse.json({ id, type: type || 'note' })
}

// Update a seed template
export async function PUT(request: NextRequest) {
	const session = await auth?.api.getSession({ headers: request.headers })
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const body = await request.json()
	const { id, type, name, content, parentFolderId, pinned, order } = body

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	const db = getDatabase()
	const now = Date.now()

	if (type === 'folder') {
		await db
			.update(seedTemplateFolders)
			.set({
				name,
				parentFolderId: parentFolderId || null,
				order: order ?? 0,
				updatedAt: now
			})
			.where(eq(seedTemplateFolders.id, id))
	} else {
		await db
			.update(seedTemplateNotes)
			.set({
				name,
				content,
				parentFolderId: parentFolderId || null,
				pinned: pinned ?? 0,
				order: order ?? 0,
				updatedAt: now
			})
			.where(eq(seedTemplateNotes.id, id))
	}

	return NextResponse.json({ success: true })
}

// Delete a seed template
export async function DELETE(request: NextRequest) {
	const session = await auth?.api.getSession({ headers: request.headers })
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')
	const type = searchParams.get('type')

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	const db = getDatabase()

	if (type === 'folder') {
		await db.delete(seedTemplateFolders).where(eq(seedTemplateFolders.id, id))
	} else {
		await db.delete(seedTemplateNotes).where(eq(seedTemplateNotes.id, id))
	}

	return NextResponse.json({ success: true })
}
