import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const hasDatabaseUrl = !!process.env.DATABASE_URL
    const databaseUrlPreview = process.env.DATABASE_URL 
      ? `${process.env.DATABASE_URL.substring(0, 20)}...` 
      : 'not set'
    
    // Try to import @skriuw/db to check if it's available
    let dbModuleAvailable = false
    let dbModuleError = null
    try {
      await import('@skriuw/db')
      dbModuleAvailable = true
    } catch (error) {
      dbModuleError = error instanceof Error ? error.message : String(error)
    }

    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasDatabaseUrl,
        databaseUrlPreview,
        dbModuleAvailable,
        dbModuleError
      }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ 
      error: 'Health check failed',
      message: errorMessage
    })
  }
}

