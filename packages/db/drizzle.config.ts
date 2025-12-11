import type { Config } from 'drizzle-kit'
import { env } from '@skriuw/env/server'

export default {
	schema: './db/schema.ts',
	out: './lib/db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: env.DATABASE_URL
	}
} satisfies Config

