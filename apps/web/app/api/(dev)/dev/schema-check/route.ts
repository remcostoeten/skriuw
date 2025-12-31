import { NextResponse } from 'next/server'
import { getDatabase } from '@skriuw/db'
import { sql } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'

function isDev() {
    return process.env.NODE_ENV === 'development'
}

type TableColumn = {
    column_name: string
    data_type: string
}

type TableInfo = {
    table_name: string
    columns: string[]
}

type SchemaComparison = {
    inSync: boolean
    missingTables: string[]
    missingColumns: Array<{
        table: string
        columns: string[]
    }>
    extraTables: string[]
}

/**
 * Parse SQL migration files to extract expected schema
 */
function parseExpectedSchema(migrationsPath: string): Map<string, Set<string>> {
    const expectedSchema = new Map<string, Set<string>>()

    try {
        const files = fs.readdirSync(migrationsPath)
            .filter(f => f.endsWith('.sql'))
            .sort() // Process migrations in order

        for (const file of files) {
            const filePath = path.join(migrationsPath, file)
            const content = fs.readFileSync(filePath, 'utf-8')

            // Extract CREATE TABLE statements
            const createTableRegex = /CREATE TABLE\s+"?(\w+)"?\s*\(([\s\S]*?)\);/gi
            let match

            while ((match = createTableRegex.exec(content)) !== null) {
                const tableName = match[1]
                const tableBody = match[2]

                // Extract column names from table definition
                const columnRegex = /"?(\w+)"?\s+(?:text|integer|bigint|boolean|timestamp)/gi
                const columns = new Set<string>()
                let colMatch

                while ((colMatch = columnRegex.exec(tableBody)) !== null) {
                    columns.add(colMatch[1])
                }

                expectedSchema.set(tableName, columns)
            }

            // Extract ALTER TABLE ADD COLUMN statements
            const alterAddRegex = /ALTER TABLE\s+"?(\w+)"?\s+ADD COLUMN\s+"?(\w+)"?/gi

            while ((match = alterAddRegex.exec(content)) !== null) {
                const tableName = match[1]
                const columnName = match[2]

                if (!expectedSchema.has(tableName)) {
                    expectedSchema.set(tableName, new Set())
                }
                expectedSchema.get(tableName)!.add(columnName)
            }
        }
    } catch (error) {
        console.error('Error parsing migration files:', error)
    }

    return expectedSchema
}

/**
 * Query database to get actual schema
 */
async function getActualSchema(db: any): Promise<Map<string, Set<string>>> {
    const actualSchema = new Map<string, Set<string>>()

    try {
        // Get all tables in the public schema
        const tablesResult = await db.execute(sql`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_type = 'BASE TABLE'
		`)

        // For each table, get its columns
        for (const row of tablesResult.rows as Array<{ table_name: string }>) {
            const tableName = row.table_name

            const columnsResult = await db.execute(sql`
				SELECT column_name, data_type
				FROM information_schema.columns
				WHERE table_schema = 'public'
				AND table_name = ${tableName}
			`)

            const columns = new Set<string>(
                (columnsResult.rows as Array<TableColumn>).map((col: TableColumn) => col.column_name)
            )
            actualSchema.set(tableName, columns)
        }
    } catch (error) {
        console.error('Error querying database schema:', error)
        throw error
    }

    return actualSchema
}

/**
 * Compare expected schema with actual database schema
 */
function compareSchemas(
    expected: Map<string, Set<string>>,
    actual: Map<string, Set<string>>
): SchemaComparison {
    const missingTables: string[] = []
    const missingColumns: Array<{ table: string; columns: string[] }> = []
    const extraTables: string[] = []

    // Check for missing tables
    for (const [tableName] of expected) {
        if (!actual.has(tableName)) {
            missingTables.push(tableName)
        }
    }

    // Check for extra tables (in DB but not in migrations)
    for (const [tableName] of actual) {
        if (!expected.has(tableName)) {
            extraTables.push(tableName)
        }
    }

    // Check for missing columns in existing tables
    for (const [tableName, expectedColumns] of expected) {
        if (actual.has(tableName)) {
            const actualColumns = actual.get(tableName)!
            const missing: string[] = []

            for (const col of expectedColumns) {
                if (!actualColumns.has(col)) {
                    missing.push(col)
                }
            }

            if (missing.length > 0) {
                missingColumns.push({ table: tableName, columns: missing })
            }
        }
    }

    const inSync = missingTables.length === 0 && missingColumns.length === 0

    return {
        inSync,
        missingTables,
        missingColumns,
        extraTables,
    }
}

export async function GET() {
    if (!isDev()) {
        return NextResponse.json(
            { error: 'Schema check is only available in development mode' },
            { status: 403 }
        )
    }

    try {
        const db = getDatabase()

        // Test database connection
        try {
            await db.execute(sql`SELECT 1`)
        } catch (error) {
            return NextResponse.json(
                {
                    error: 'Database not connected',
                    message: 'Please ensure your database is running and accessible',
                },
                { status: 503 }
            )
        }

        // Get migrations path
        const migrationsPath = path.join(
            process.cwd(),
            '..',
            '..',
            'packages',
            'db',
            'lib',
            'db',
            'migrations'
        )

        // Parse expected schema from migration files
        const expectedSchema = parseExpectedSchema(migrationsPath)

        // Get actual schema from database
        const actualSchema = await getActualSchema(db)

        // Compare schemas
        const comparison = compareSchemas(expectedSchema, actualSchema)

        return NextResponse.json({
            success: true,
            ...comparison,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Schema check error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: 'Schema check failed', message: errorMessage },
            { status: 500 }
        )
    }
}
