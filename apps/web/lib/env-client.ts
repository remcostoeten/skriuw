import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

/**
 * Client-only environment variables.
 *
 * Use this instead of the server env in browser code so that
 * required server secrets (e.g. DATABASE_URL) don't crash the bundle.
 */
export const clientEnv = createEnv({
	clientPrefix: 'NEXT_PUBLIC_',
	server: {},
	client: {
		NEXT_PUBLIC_APP_URL: z.string().url().optional(),
		NEXT_PUBLIC_DROPBOX_CLIENT_ID: z.string().optional(),
		NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
		NEXT_PUBLIC_DROPBOX_CLIENT_ID: process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID,
		NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
	},
})
