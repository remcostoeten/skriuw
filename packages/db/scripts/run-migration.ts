import { readFileSync } from 'fs'
import { join } from 'path'

async function runMigration() {

    const { default: postgres } = await import('postgres')

    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'



    const migrationSQL = readFileSync(

        join(__dirname, 'packages/db/lib/db/migrations/0000_luxuriant_expediter.sql'),

        'utf-8'

    )



    const sql = postgres(connectionString)



    try {

        await sql.unsafe(migrationSQL)

    } catch (error: unknown) {

        if (error instanceof Error) {

            console.error('❌ Migration failed:', error.message)

        } else {

            console.error('❌ Migration failed with an unknown error:', error)

        }

    } finally {

        await sql.end()

    }

}

runMigration()
