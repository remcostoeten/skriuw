import { env } from '../env'

const REQUIRED_ENV_VARS = [
	'NEXT_PUBLIC_DROPBOX_CLIENT_ID',
	'DROPBOX_CLIENT_SECRET',
	'NEXT_PUBLIC_APP_URL',
	'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
	'GOOGLE_DRIVE_CLIENT_SECRET'
] as const

for (const key of REQUIRED_ENV_VARS) {
	if (!process.env[key] && !env[key as keyof typeof env]) {
		throw new Error(`Missing required environment variable: ${key}`)
	}
}

export const OAUTH2_CONFIGS = {
	dropbox: {
		authUrl: 'https://www.dropbox.com/oauth2/authorize',
		tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
		clientId: process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID!,
		clientSecret: env.DROPBOX_CLIENT_SECRET,
		redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/storage/oauth2/callback/dropbox`,
		scope: ''
	},
	'google-drive': {
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
		clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
		redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/storage/oauth2/callback/google-drive`,
		scope: 'https://www.googleapis.com/auth/drive.file'
	}
} as const

export type OAuth2Provider = keyof typeof OAUTH2_CONFIGS
