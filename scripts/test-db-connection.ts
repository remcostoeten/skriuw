import postgres from 'postgres'

async function testConnection() {
    const databaseUrl = process.env.DATABASE_URL
    
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL is not set')
        process.exit(1)
    }
    
    console.log('🔍 Testing database connection...')
    console.log(`   URL: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`)
    
    try {
        const sql = postgres(databaseUrl)
        const result = await sql`SELECT NOW() as current_time, current_database() as db_name`
        
        console.log('✅ Connection successful!')
        console.log(`   Database: ${result[0].db_name}`)
        console.log(`   Server time: ${result[0].current_time}`)
        
        await sql.end()
        process.exit(0)
    } catch (error: any) {
        console.error('❌ Connection failed!')
        console.error(`   Error: ${error.message}`)
        
        if (error.message.includes('password')) {
            console.error('\n💡 Hint: Your DATABASE_URL appears to be missing a password.')
            console.error('   Format: postgresql://user:PASSWORD@host/database')
        }
        
        process.exit(1)
    }
}

testConnection()
