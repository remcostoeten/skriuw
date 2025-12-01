/**
 * Script to reset database schema by dropping all tables
 * Run with: pnpm tsx reset-schema.ts
 */
import { config } from 'dotenv'
import postgres from 'postgres'

config()

async function resetSchema() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('🔌 Connecting to database...')
  const sql = postgres(databaseUrl)

  try {
    // Drop all tables in correct order (respecting foreign keys)
    console.log('🗑️  Dropping tables...')
    
    await sql`DROP TABLE IF EXISTS tasks CASCADE`
    console.log('  ✓ Dropped tasks table')
    
    await sql`DROP TABLE IF EXISTS notes CASCADE`
    console.log('  ✓ Dropped notes table')
    
    await sql`DROP TABLE IF EXISTS folders CASCADE`
    console.log('  ✓ Dropped folders table')
    
    await sql`DROP TABLE IF EXISTS settings CASCADE`
    console.log('  ✓ Dropped settings table')

    console.log('✅ All tables dropped successfully!')
    console.log('📝 Now run: pnpm db:push')
  } catch (error) {
    console.error('❌ Error resetting schema:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

resetSchema()

