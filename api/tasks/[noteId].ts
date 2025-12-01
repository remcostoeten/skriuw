import { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { getDatabase, tasks } from '@skriuw/db'

// Serverless function for getting tasks for a note
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const db = await getDatabase()
    const { noteId } = req.query

    if (typeof noteId !== 'string') {
      return res.status(400).json({ error: 'noteId is required' })
    }

    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.noteId, noteId))
      .orderBy(tasks.position)

    res.status(200).json(result)
  } catch (error) {
    console.error('Database error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      method: req.method,
      url: req.url,
      query: req.query
    })
    
    res.status(500).json({ 
      error: 'Failed to fetch tasks',
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
    })
  }
}