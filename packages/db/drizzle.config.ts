import { config } from 'dotenv'
import type { Config } from 'drizzle-kit'

// Load environment variables from the root directory
config({ path: '../../.env.local' })
config({ path: '../../.env' }) // Fallback/merge

// Use require to avoid top-level import hoisting which would run validation before dotenv loads
const { database } = require('@skriuw/env/server')

export default {
	schema: './db/schema.ts',
	out: './lib/db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: database.url
	}
} satisfies Config
