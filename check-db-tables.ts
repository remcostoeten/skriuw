import { config } from 'dotenv'

config()

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'

async function checkTables() {
    try {
        // Use bun's built-in fetch to connect to postgres
        const { default: postgres } = await import('postgres')
        const sql = postgres(connectionString)

        const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `

        console.log('\n📊 Tables in database:')
        console.log('🔗 Connection:', connectionString.replace(/:[^:@]+@/, ':****@'))
        console.log('')

        if (result.length === 0) {
            console.log('❌ No tables found! Database is empty.')
            console.log('\n💡 The schema exists but tables were not created.')
            console.log('   This usually means drizzle-kit push detected no changes.')
            console.log('   Try dropping the database and running: bun db:push')
        } else {
            result.forEach((row: any) => {
                console.log(`  ✓ ${row.table_name}`)
            })
            console.log(`\n✅ Total: ${result.length} tables found`)
        }

        await sql.end()
    } catch (error: any) {
        console.error('❌ Error checking database:')
        console.error('   ', error.message)
        console.log('\n💡 Make sure your DATABASE_URL is correct in .env')
    }
}

checkTables()
