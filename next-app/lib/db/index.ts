import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import postgres from 'postgres'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

export * from './schema'

type DatabaseProvider = 'neon' | 'postgres'

let dbClient: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePostgres> | null = null

function detectProvider(url: string): DatabaseProvider {
  const explicitProvider = process.env.DATABASE_PROVIDER as DatabaseProvider | undefined
  if (explicitProvider && (explicitProvider === 'neon' || explicitProvider === 'postgres')) {
    return explicitProvider
  }
  
  // Auto-detect based on URL
  if (url.includes('neon.tech') || url.includes('neon')) {
    return 'neon'
  }
  
  return 'postgres'
}

export function getDatabase() {
  if (dbClient) {
    return dbClient
  }

  const url = process.env.DATABASE_URL
  
  if (!url) {
    throw new Error(
      'DATABASE_URL environment variable is required.\n' +
      'Set DATABASE_URL=postgresql://user:password@host:port/database'
    )
  }

  const provider = detectProvider(url)

  if (provider === 'neon') {
    const sql = neon(url)
    dbClient = drizzleNeon(sql, { schema })
    console.log('✅ Database: Connected via Neon')
  } else {
    const queryClient = postgres(url)
    dbClient = drizzlePostgres(queryClient, { schema })
    console.log('✅ Database: Connected via PostgreSQL')
  }

  return dbClient
}
