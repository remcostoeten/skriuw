import { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { getDatabase, notes } from '../../packages/db/src/index.js'

// Serverless function for CRUD operations on notes
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    // Try to get database connection with better error handling
    let db
    try {
      db = await getDatabase()
    } catch (dbError) {
      console.error('Failed to get database connection:', dbError)
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError)
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? String(dbError) : undefined
      })
    }

    switch (req.method) {
      case 'GET':
        // Get all notes
        try {
          const allNotes = await db.select().from(notes)
          return res.status(200).json(allNotes)
        } catch (queryError) {
          console.error('Query error:', queryError)
          const errorMessage = queryError instanceof Error ? queryError.message : String(queryError)
          // Check if it's a "table does not exist" error
          if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('table')) {
            return res.status(500).json({ 
              error: 'Database schema not initialized',
              message: 'The database tables do not exist. Please run migrations: cd packages/db && pnpm db:push',
              hint: 'The schema needs to be pushed to the database before queries can be executed.'
            })
          }
          throw queryError // Re-throw to be caught by outer catch
        }

      case 'POST':
        // Create new note
        const { name, content, parentFolderId } = req.body
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

        return res.status(201).json(newNote[0])

      case 'PUT':
        // Update note
        const { id: noteId, ...updateData } = req.body
        const updatedNote = await db
          .update(notes)
          .set({
            ...updateData,
            updatedAt: Date.now()
          })
          .where(eq(notes.id, noteId))
          .returning()

        if (updatedNote.length === 0) {
          return res.status(404).json({ error: 'Note not found' })
        }

        return res.status(200).json(updatedNote[0])

      case 'DELETE':
        // Delete note
        const { id: deleteId } = req.query
        if (typeof deleteId !== 'string') {
          return res.status(400).json({ error: 'Note ID is required' })
        }

        const deletedNote = await db
          .delete(notes)
          .where(eq(notes.id, deleteId))
          .returning()

        if (deletedNote.length === 0) {
          return res.status(404).json({ error: 'Note not found' })
        }

        return res.status(200).json(deletedNote[0])

      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Database error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    // Extract more details from the error
    const errorDetails: any = {
      message: errorMessage,
      method: req.method,
      url: req.url
    }
    
    // Check for common database errors
    if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('table')) {
      errorDetails.hint = 'Database schema not initialized. Run: cd packages/db && pnpm db:push'
      errorDetails.type = 'schema_missing'
    } else if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
      errorDetails.hint = 'Database connection failed. Check DATABASE_URL environment variable.'
      errorDetails.type = 'connection_error'
    }
    
    if (process.env.NODE_ENV === 'development') {
      errorDetails.stack = errorStack
      errorDetails.body = req.body
    }
    
    console.error('Error details:', errorDetails)
    
    res.status(500).json({ 
      error: 'Internal server error',
      ...errorDetails
    })
  }
}