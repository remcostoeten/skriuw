import type { Config } from 'drizzle-kit'

export default {
	schema: ['./src/schema.ts', './src/activity-events.ts'],
	out: './migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL as string
	}
} satisfies Config
