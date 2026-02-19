import { getDatabase } from '../src';
import { sql } from 'drizzle-orm';

async function resetDb() {
    console.log('🗑️  Clearing database...');
    const db = getDatabase();

    try {
        // Drop public schema and recreate it to clear everything
        await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
        await db.execute(sql`CREATE SCHEMA public`);
        // Restore default grants
        // await db.execute(sql`GRANT ALL ON SCHEMA public TO postgres`); // Removed as role might not exist
        await db.execute(sql`GRANT ALL ON SCHEMA public TO public`);
        console.log('✅ Database cleared successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to clear database:', error);
        process.exit(1);
    }
}

resetDb();
