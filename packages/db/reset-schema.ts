/**
 * Script to reset database schema by dropping all tables
 * Run with: pnpm reset
 */
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from root directory
config({ path: resolve(import.meta.dirname, '../../.env') })
// Also try loading from packages/db directory
config({ path: resolve(import.meta.dirname, '.env') })

function detectProvider(url: string): 'neon' | 'postgres' {
  if (url.includes('neon.tech') || url.includes('neon')) {
    return 'neon'
  }
  return 'postgres'
}

async function resetSchema() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const provider = detectProvider(databaseUrl)
  console.log(`🔌 Connecting to database (${provider})...`)

  let sql: any

  if (provider === 'neon') {
    const { neon } = await import('@neondatabase/serverless')
    sql = neon(databaseUrl)
  } else {
    const postgres = await import('postgres')
    sql = postgres.default(databaseUrl)
  }

  try {
    // Drop all tables in correct order (respecting foreign keys)
    console.log('🗑️  Dropping tables...')
    
    if (provider === 'neon') {
      // Neon uses template literals differently
      await sql('DROP TABLE IF EXISTS tasks CASCADE')
      console.log('  ✓ Dropped tasks table')
      
      await sql('DROP TABLE IF EXISTS notes CASCADE')
      console.log('  ✓ Dropped notes table')
      
      await sql('DROP TABLE IF EXISTS folders CASCADE')
      console.log('  ✓ Dropped folders table')
      
      await sql('DROP TABLE IF EXISTS settings CASCADE')
      console.log('  ✓ Dropped settings table')
    } else {
      await sql`DROP TABLE IF EXISTS tasks CASCADE`
      console.log('  ✓ Dropped tasks table')
      
      await sql`DROP TABLE IF EXISTS notes CASCADE`
      console.log('  ✓ Dropped notes table')
      
      await sql`DROP TABLE IF EXISTS folders CASCADE`
      console.log('  ✓ Dropped folders table')
      
      await sql`DROP TABLE IF EXISTS settings CASCADE`
      console.log('  ✓ Dropped settings table')
    }

    console.log('✅ All tables dropped successfully!')
    console.log('📝 Now run: pnpm db:push')
  } catch (error) {
    console.error('❌ Error resetting schema:', error)
    process.exit(1)
  } finally {
    if (provider === 'postgres' && sql && typeof sql.end === 'function') {
      await sql.end()
    }
  }
}

resetSchema()

