import { config } from 'dotenv'
import type { Config } from 'drizzle-kit'

config()

export default {
	schema: './lib/db/schema.ts',
	out: './lib/db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
	},
} satisfies Config
