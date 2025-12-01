import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const hasDatabaseUrl = !!process.env.DATABASE_URL
    const databaseUrlPreview = process.env.DATABASE_URL 
      ? `${process.env.DATABASE_URL.substring(0, 20)}...` 
      : 'not set'
    
    let dbModuleAvailable = false
    let dbModuleError = null
    
    try {
      await import('@/lib/db')
      dbModuleAvailable = true
    } catch (error) {
      dbModuleError = error instanceof Error ? error.message : String(error)
    }

    return NextResponse.json({
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
    return NextResponse.json(
      { error: 'Health check failed', message: errorMessage },
      { status: 500 }
    )
  }
}
