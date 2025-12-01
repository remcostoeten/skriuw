/**
 * Script to apply migrations directly to database
 * Run with: pnpm tsx apply-migrations.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { glob } from 'glob'

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

async function applyMigrations() {
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
    // Find all migration files
    const migrationsDir = resolve(import.meta.dirname, 'migrations')
    const migrationFiles = await glob('*.sql', { cwd: migrationsDir, ignore: 'meta/**' })
    migrationFiles.sort()

    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found. Run: pnpm db:generate')
      process.exit(1)
    }

    console.log(`📦 Found ${migrationFiles.length} migration file(s)`)

    for (const file of migrationFiles) {
      const filePath = resolve(migrationsDir, file)
      const migrationSQL = readFileSync(filePath, 'utf-8')
      
      console.log(`\n📝 Applying ${file}...`)
      
      // Split by statement breakpoint and execute each statement
      const statements = migrationSQL
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            if (provider === 'neon') {
              await sql(statement)
            } else {
              await sql.unsafe(statement)
            }
          } catch (error: any) {
            // Ignore "already exists" errors
            if (error?.message?.includes('already exists') || error?.code === '42P07') {
              console.log(`  ⚠️  Skipped (already exists): ${statement.substring(0, 50)}...`)
            } else {
              throw error
            }
          }
        }
      }
      
      console.log(`  ✓ Applied ${file}`)
    }

    console.log('\n✅ All migrations applied successfully!')
  } catch (error) {
    console.error('❌ Error applying migrations:', error)
    process.exit(1)
  } finally {
    if (provider === 'postgres' && sql && typeof sql.end === 'function') {
      await sql.end()
    }
  }
}

applyMigrations()

