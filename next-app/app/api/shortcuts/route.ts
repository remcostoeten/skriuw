import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDatabase, shortcuts } from '@/lib/db'

function deserializeShortcut(row: typeof shortcuts.$inferSelect) {
  let parsedKeys: unknown = []
  try {
    parsedKeys = JSON.parse(row.keys)
  } catch (error) {
    console.warn(`Failed to parse shortcut keys for ${row.id}`, error)
  }

  return {
    id: row.id,
    keys: parsedKeys,
    customizedAt: new Date(row.customizedAt).toISOString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function upsertShortcut(body: any) {
  const db = getDatabase()
  const now = Date.now()
  const id: string | undefined = body?.id
  const keys = Array.isArray(body?.keys) ? body.keys : []
  if (!id) {
    throw new Error('Shortcut id is required')
  }

  const customizedAt = typeof body?.customizedAt === 'string'
    ? Date.parse(body.customizedAt)
    : now

  const existing = await db
    .select()
    .from(shortcuts)
    .where(eq(shortcuts.id, id))
    .limit(1)

  if (existing.length > 0) {
    const [updated] = await db
      .update(shortcuts)
      .set({
        keys: JSON.stringify(keys),
        customizedAt: Number.isNaN(customizedAt) ? now : customizedAt,
        updatedAt: now
      })
      .where(eq(shortcuts.id, id))
      .returning()

    return deserializeShortcut(updated)
  }

  const [created] = await db
    .insert(shortcuts)
    .values({
      id,
      keys: JSON.stringify(keys),
      customizedAt: Number.isNaN(customizedAt) ? now : customizedAt,
      createdAt: now,
      updatedAt: now
    })
    .returning()

  return deserializeShortcut(created)
}

export async function GET(request: NextRequest) {
  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const result = await db
        .select()
        .from(shortcuts)
        .where(eq(shortcuts.id, id))
        .limit(1)

      if (result.length === 0) {
        return NextResponse.json(null, { status: 404 })
      }

      return NextResponse.json(deserializeShortcut(result[0]))
    }

    const allShortcuts = await db.select().from(shortcuts)
    return NextResponse.json(allShortcuts.map(deserializeShortcut))
  } catch (error) {
    console.error('Failed to load shortcuts:', error)
    return NextResponse.json(
      { error: 'Failed to load shortcuts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const shortcut = await upsertShortcut(body)
    return NextResponse.json(shortcut, { status: 201 })
  } catch (error) {
    console.error('Failed to save shortcut:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save shortcut' },
      { status: 400 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const shortcut = await upsertShortcut(body)
    return NextResponse.json(shortcut)
  } catch (error) {
    console.error('Failed to update shortcut:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update shortcut' },
      { status: 400 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Shortcut id is required' }, { status: 400 })
    }

    await db.delete(shortcuts).where(eq(shortcuts.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete shortcut:', error)
    return NextResponse.json(
      { error: 'Failed to delete shortcut' },
      { status: 500 }
    )
  }
}
