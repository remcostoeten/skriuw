import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDatabase } from '@/shared/database/client'
import { notes } from '@/shared/database/schema'

// Next.js API Route for notes CRUD operations
export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      // Get single note
      const result = await db
        .select()
        .from(notes)
        .where(eq(notes.id, id))
        .limit(1)

      if (result.length === 0) {
        return NextResponse.json({ error: 'Note not found' }, { status: 404 })
      }

      return NextResponse.json(result[0])
    } else {
      // Get all notes
      const allNotes = await db.select().from(notes)
      return NextResponse.json(allNotes)
    }
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase()
    const body = await request.json()
    const { name, content, parentFolderId } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const now = Date.now()
    const id = `note-${now}-${Math.random().toString(36).substr(2, 9)}`

    const newNote = await db.insert(notes).values({
      id,
      name,
      content: JSON.stringify(content || []),
      parentFolderId: parentFolderId || null,
      createdAt: now,
      updatedAt: now,
      type: 'note'
    }).returning()

    return NextResponse.json(newNote[0], { status: 201 })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDatabase()
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      )
    }

    const processedData = {
      ...updateData,
      content: updateData.content ? JSON.stringify(updateData.content) : undefined,
      updatedAt: Date.now()
    }

    const updatedNote = await db
      .update(notes)
      .set(processedData)
      .where(eq(notes.id, id))
      .returning()

    if (updatedNote.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    return NextResponse.json(updatedNote[0])
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = await getDatabase()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      )
    }

    const deletedNote = await db
      .delete(notes)
      .where(eq(notes.id, id))
      .returning()

    if (deletedNote.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    return NextResponse.json(deletedNote[0])
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}