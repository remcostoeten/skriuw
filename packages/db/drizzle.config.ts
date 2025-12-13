import { config } from 'dotenv'
import type { Config } from 'drizzle-kit'

// Load the workspace root .env first, then allow a package-local .env to override if present
config({ path: '../../.env', override: true, quiet: true })
config({ quiet: true })

export default {
	schema: './src/schema.ts',
	out: './migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ||
			'postgresql://postgres:postgres@localhost:5432/postgres'
	}
} satisfies Config
