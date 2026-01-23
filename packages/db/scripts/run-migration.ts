import { readFileSync } from "fs";
import { join } from "path";

async function runMigration() {
	const { default: postgres } = await import('postgres')
	const connectionString =
		process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'

	console.log('🔄 Running migration manually...')
	console.log('📁 Reading migration file...')

	const migrationSQL = readFileSync(
		join(__dirname, 'packages/db/lib/db/migrations/0000_luxuriant_expediter.sql'),
		'utf-8'
	)

	const sql = postgres(connectionString)

	try {
		console.log('🚀 Executing migration...')
		await sql.unsafe(migrationSQL)
		console.log('✅ Migration completed successfully!')

		// Verify tables were created
		const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `

		console.log(`\n📊 Created ${tables.length} tables:`)
		tables.forEach((row: any) => console.log(`  ✓ ${row.table_name}`))
	} catch (error: any) {
		console.error('❌ Migration failed:', error.message)
	} finally {
		await sql.end()
	}
}

runMigration()
