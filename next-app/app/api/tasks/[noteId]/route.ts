import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDatabase } from '@/shared/database/client'
import { tasks } from '@/shared/database/schema'

// Next.js API Route for getting tasks for a note
export async function GET(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const db = await getDatabase()
    const { noteId } = params

    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.noteId, noteId))
      .orderBy(tasks.position)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}