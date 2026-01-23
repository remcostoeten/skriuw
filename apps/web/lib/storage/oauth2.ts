import { env } from "../env";

/**
 * Validates that a required environment variable is present.
 * Throws a clear error if variable is missing.
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

export const OAUTH2_CONFIGS = {
	dropbox: {
		authUrl: 'https://www.dropbox.com/oauth2/authorize',
		tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
		get clientId() {
			return requireEnv(
				'NEXT_PUBLIC_DROPBOX_CLIENT_ID',
				process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
			)
		},
		get clientSecret() {
			return requireEnv('DROPBOX_CLIENT_SECRET', env.DROPBOX_CLIENT_SECRET)
		},
		get redirectUri() {
			return `${requireEnv('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL)}/api/storage/oauth2/callback/dropbox`
		},
		scope: 'files.content.write files.content.read account_info.read'
	},
	'google-drive': {
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		get clientId() {
			return requireEnv(
				'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
				process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
			)
		},
		get clientSecret() {
			return requireEnv('GOOGLE_DRIVE_CLIENT_SECRET', env.GOOGLE_DRIVE_CLIENT_SECRET)
		},
		get redirectUri() {
			return `${requireEnv('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL)}/api/storage/oauth2/callback/google-drive`
		},
		scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'
	}
}

export type OAuth2Provider = keyof typeof OAUTH2_CONFIGS
