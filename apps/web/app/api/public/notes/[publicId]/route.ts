import { NextRequest, NextResponse } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import crypto from 'crypto'

import { getDatabase, notes, user, storageConnectors, noteVisitors } from '@skriuw/db'
import type { Note } from '@/features/notes/types'
import { auth } from '@/lib/auth'

type PublicNoteResponse = {
	note: {
		id: string
		name: string
		content: string
		createdAt: number
		updatedAt: number
		publicViews: number
		author?: {
			id: string
			name: string | null
		}
	}
}

function buildFingerprint(request: NextRequest): string {
	const zeroCookie = request.cookies.get('skriuw_zero_session')?.value
	if (zeroCookie) return zeroCookie

	const ip = request.headers.get('x-forwarded-for') ?? request.ip ?? ''
	const ua = request.headers.get('user-agent') ?? ''
	const accept = request.headers.get('accept-language') ?? ''
	const raw = `${ip}|${ua}|${accept}`
	return crypto.createHash('sha256').update(raw).digest('hex')
}

function buildVisitorId(): string {
	return `vis_${crypto.randomUUID()}`
}

async function ensureCloudEnabled(ownerId: string): Promise<boolean> {
	const connectorRows = await getDatabase()
		.select({ id: storageConnectors.id })
		.from(storageConnectors)
		.where(eq(storageConnectors.userId, ownerId))
		.limit(1)
	return connectorRows.length > 0
}

async function findPublicNote(publicId: string): Promise<(Note & { userId?: string | null }) | null> {
	const rows = await getDatabase()
		.select()
		.from(notes)
		.where(and(eq(notes.publicId, publicId), eq(notes.isPublic, true)))
		.limit(1)
	if (rows.length === 0) return null
	return rows[0] as Note & { userId?: string | null }
}

async function fetchAuthor(userId: string | null | undefined) {
	if (!userId) return null
	const rows = await getDatabase().select().from(user).where(eq(user.id, userId)).limit(1)
	if (rows.length === 0) return null
	return rows[0]
}

async function trackVisitor(noteId: string, visitorKey: string, viewerId?: string | null) {
	const db = getDatabase()
	try {
		const inserted = await db
			.insert(noteVisitors)
			.values({
				id: buildVisitorId(),
				noteId,
				visitorKey,
				viewerUserId: viewerId ?? null,
				createdAt: Date.now(),
			})
			.onConflictDoNothing({
				target: [noteVisitors.noteId, noteVisitors.visitorKey],
			})
			.returning()

		if (inserted.length > 0) {
			await db
				.update(notes)
				.set({ publicViews: sql`${notes.publicViews} + 1` })
				.where(eq(notes.id, noteId))
		}
	} catch {
		// Ignore counting errors to keep serving content
	}
}

export async function GET(request: NextRequest, context: { params: { publicId: string } }) {
	const { publicId } = context.params
	if (!publicId) {
		return NextResponse.json({ error: 'Missing note id' }, { status: 400 })
	}

	const note = await findPublicNote(publicId)
	if (!note) {
		return NextResponse.json({ error: 'Note not found' }, { status: 404 })
	}

	const cloudEnabled = await ensureCloudEnabled(note.userId ?? '')
	if (!cloudEnabled) {
		return NextResponse.json({ error: 'Note unavailable' }, { status: 404 })
	}

	let sessionUserId: string | null = null
	try {
		const session = (await auth.api.getSession({ headers: request.headers })) as {
			user?: { id?: string | null }
		} | null
		sessionUserId = session?.user?.id ?? null
	} catch {
		sessionUserId = null
	}

	const author = await fetchAuthor(note.userId)

	if (!sessionUserId || sessionUserId !== note.userId) {
		const fingerprint = buildFingerprint(request)
		await trackVisitor(note.id, fingerprint, sessionUserId)
	}

	const response: PublicNoteResponse = {
		note: {
			id: note.id,
			name: note.name,
			content: note.content as unknown as string,
			createdAt: Number(note.createdAt),
			updatedAt: Number(note.updatedAt),
			publicViews: Number(note.publicViews ?? 0),
			author: author
				? {
						id: author.id,
						name: author.name,
					}
				: undefined,
		},
	}

	return NextResponse.json(response)
}
