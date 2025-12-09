import { config } from 'dotenv'
import postgres from 'postgres'

config({ quiet: true })

async function dropAllTables() {
	const databaseUrl = process.env.DATABASE_URL

	if (!databaseUrl) {
		throw new Error('DATABASE_URL environment variable is required to drop tables.')
	}

	const sql = postgres(databaseUrl, { max: 1 })

	try {
		const tables = await (sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg\\_%'
        AND tablename NOT LIKE 'sql\\_%'
    ` as unknown as Promise<{ tablename: string }[]>)

		if (tables.length === 0) {
			console.log('ℹ️ No user tables found in public schema.')
			return
		}

		console.log(`⚠️ Dropping ${tables.length} tables from ${databaseUrl}`)

		for (const { tablename } of tables) {
			console.log(` - Dropping table "${tablename}"`)
			await sql.unsafe(`DROP TABLE IF EXISTS "${tablename}" CASCADE`)
		}

		console.log('✅ All tables dropped successfully.')
	} finally {
		await sql.end({ timeout: 5 })
	}
}

dropAllTables().catch((error) => {
	console.error('❌ Failed to drop tables:', error)
	process.exit(1)
})
