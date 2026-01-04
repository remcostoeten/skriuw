import { env } from '../env'

/**
 * Validates that a required environment variable is present.
 * Throws a clear error if the variable is missing.
 */
function requireEnv(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(
			`Missing required environment variable: ${name}. ` +
			`Please ensure it is set in your .env.local file.`
		)
	}
	return value
}

// Validate all required environment variables at module initialization
const validatedEnv = {
	dropboxClientId: requireEnv('NEXT_PUBLIC_DROPBOX_CLIENT_ID', process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID),
	dropboxClientSecret: requireEnv('DROPBOX_CLIENT_SECRET', env.DROPBOX_CLIENT_SECRET),
	googleClientId: requireEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
	googleClientSecret: requireEnv('GOOGLE_DRIVE_CLIENT_SECRET', env.GOOGLE_DRIVE_CLIENT_SECRET),
	appUrl: requireEnv('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL),
}

export const OAUTH2_CONFIGS = {
	dropbox: {
		authUrl: 'https://www.dropbox.com/oauth2/authorize',
		tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
		clientId: validatedEnv.dropboxClientId,
		clientSecret: validatedEnv.dropboxClientSecret,
		redirectUri: `${validatedEnv.appUrl}/api/storage/oauth2/callback/dropbox`,
		scope: ''
	},
	'google-drive': {
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		clientId: validatedEnv.googleClientId,
		clientSecret: validatedEnv.googleClientSecret,
		redirectUri: `${validatedEnv.appUrl}/api/storage/oauth2/callback/google-drive`,
		scope: 'https://www.googleapis.com/auth/drive.file'
	}
} as const

export type OAuth2Provider = keyof typeof OAUTH2_CONFIGS
