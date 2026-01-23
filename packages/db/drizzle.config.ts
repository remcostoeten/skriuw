import { config } from "dotenv";
import type { Config } from "drizzle-kit";
import { resolve } from "path";

// Load .env from project root when running from packages/db
config({ path: resolve(__dirname, '../../.env'), quiet: true })
export default {
	schema: './src/schema.ts',
	out: './migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL as string
	}
} satisfies Config
