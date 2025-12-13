/**
 * Schema management utilities for dev widget
 * Handles schema sync checking, pushing, and database reset operations
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { getDatabase } from '@skriuw/db'

const execAsync = promisify(exec)

/**
 * Check if database schema is in sync with code schema
 * This is a simplified check - in production you'd want more sophisticated comparison
 */
export async function checkSchemaSync(): Promise<{ inSync: boolean; message: string }> {
    try {
        const db = getDatabase()

        // Try a simple query to verify tables exist
        await db.execute('SELECT 1 FROM notes LIMIT 1')
        await db.execute('SELECT 1 FROM folders LIMIT 1')
        await db.execute('SELECT 1 FROM tasks LIMIT 1')
        await db.execute('SELECT 1 FROM settings LIMIT 1')
        await db.execute('SELECT 1 FROM shortcuts LIMIT 1')

        return {
            inSync: true,
            message: 'Schema is in sync'
        }
    } catch (error) {
        return {
            inSync: false,
            message: error instanceof Error ? error.message : 'Schema check failed'
        }
    }
}

/**
 * Push schema to database using drizzle-kit
 */
export async function pushSchema(): Promise<{ success: boolean; message: string }> {
    try {
        const { stdout, stderr } = await execAsync('pnpm drizzle-kit push', {
            cwd: process.cwd(),
            env: { ...process.env }
        })

        return {
            success: true,
            message: 'Schema pushed successfully'
        }
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Schema push failed'
        }
    }
}

/**
 * Reset database by dropping all tables in public schema
 * Then push the schema again
 */
export async function resetDatabase(): Promise<{ success: boolean; message: string }> {
    try {
        const db = getDatabase()

        // Drop all tables in public schema
        await db.execute(`
			DO $$ 
			DECLARE
				r RECORD;
			BEGIN
				FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
					EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
				END LOOP;
			END $$;
		`)

        // Push schema again
        const pushResult = await pushSchema()

        if (!pushResult.success) {
            return {
                success: false,
                message: `Tables dropped but schema push failed: ${pushResult.message}`
            }
        }

        return {
            success: true,
            message: 'Database reset and schema pushed successfully'
        }
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Database reset failed'
        }
    }
}

/**
 * Ping database to check connection
 */
export async function pingDatabase(): Promise<{ connected: boolean; provider: 'neon' | 'postgres' | null }> {
    try {
        const db = getDatabase()
        await db.execute('SELECT 1')

        const databaseUrl = process.env.DATABASE_URL || ''
        const provider = databaseUrl.includes('neon') ? 'neon' : 'postgres'

        return {
            connected: true,
            provider
        }
    } catch (error) {
        return {
            connected: false,
            provider: null
        }
    }
}
