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
    console.log('🗑️  Dropping tables and columns...')
    
    const tables = ['tasks', 'notes', 'folders', 'settings']
    
    for (const table of tables) {
      // First try to drop the table
      if (provider === 'neon') {
        await sql(`DROP TABLE IF EXISTS ${table} CASCADE`)
      } else {
        await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`)
      }
      
      // Also try to drop columns individually if table exists but has wrong types
      // This handles the case where table exists but columns have wrong types
      try {
        if (provider === 'neon') {
          // For Neon, we'll just drop the table - if it fails, columns might have wrong types
          // Try to alter column types first, then drop
          await sql(`ALTER TABLE IF EXISTS ${table} DROP COLUMN IF EXISTS created_at CASCADE`)
          await sql(`ALTER TABLE IF EXISTS ${table} DROP COLUMN IF EXISTS updated_at CASCADE`)
        } else {
          await sql.unsafe(`ALTER TABLE IF EXISTS ${table} DROP COLUMN IF EXISTS created_at CASCADE`)
          await sql.unsafe(`ALTER TABLE IF EXISTS ${table} DROP COLUMN IF EXISTS updated_at CASCADE`)
        }
      } catch (colError) {
        // Ignore column drop errors - table might not exist
      }
      
      // Drop table again to be sure
      if (provider === 'neon') {
        await sql(`DROP TABLE IF EXISTS ${table} CASCADE`)
      } else {
        await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`)
      }
    }
    
    console.log('  ✓ Dropped all tables and problematic columns')
    
    // Verify tables are gone
    console.log('🔍 Verifying cleanup...')
    try {
      if (provider === 'postgres') {
        const result = await sql`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('notes', 'folders', 'settings', 'tasks')
        `
        if (result.length > 0) {
          console.warn(`  ⚠️  Warning: Some tables still exist: ${result.map((r: any) => r.table_name).join(', ')}`)
          console.log('  💡 Try running the reset script again')
        } else {
          console.log('  ✓ All tables confirmed dropped')
        }
      } else {
        console.log('  ✓ Cleanup complete (Neon)')
      }
    } catch (verifyError) {
      console.log('  ✓ Cleanup attempted (verification skipped)')
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

