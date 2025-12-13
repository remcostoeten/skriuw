import type { OAuth2Config, OAuth2Tokens } from './types'
import { env } from '@/lib/env'

export interface OAuth2Provider {
	getConfig(): OAuth2Config
	exchangeCodeForTokens(code: string): Promise<OAuth2Tokens>
	refreshTokens(refreshToken: string): Promise<OAuth2Tokens>
}

export class DropboxOAuth2Provider implements OAuth2Provider {
	getConfig(): OAuth2Config {
		return {
			clientId: env.NEXT_PUBLIC_DROPBOX_CLIENT_ID || '',
			redirectUri: `${window.location.origin}/backup/oauth/dropbox`,
			scope: 'account_info.read files.metadata.write files.content.write',
			authUrl: 'https://www.dropbox.com/oauth2/authorize',
			tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
		}
	}

	async exchangeCodeForTokens(code: string): Promise<OAuth2Tokens> {
		const config = this.getConfig()
		const response = await fetch(config.tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				code,
				grant_type: 'authorization_code',
				client_id: config.clientId,
				redirect_uri: config.redirectUri,
			}),
		})

		if (!response.ok) {
			throw new Error(`Dropbox token exchange failed: ${response.status}`)
		}

		return response.json()
	}

	async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
		const config = this.getConfig()
		const response = await fetch(config.tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
				client_id: config.clientId,
			}),
		})

		if (!response.ok) {
			throw new Error(`Dropbox token refresh failed: ${response.status}`)
		}

		return response.json()
	}
}

export class GoogleDriveOAuth2Provider implements OAuth2Provider {
	getConfig(): OAuth2Config {
		return {
			clientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
			redirectUri: `${window.location.origin}/backup/oauth/google-drive`,
			scope: 'https://www.googleapis.com/auth/drive.file',
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
		}
	}

	async exchangeCodeForTokens(code: string): Promise<OAuth2Tokens> {
		const config = this.getConfig()
		const response = await fetch(config.tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				code,
				grant_type: 'authorization_code',
				client_id: config.clientId,
				redirect_uri: config.redirectUri,
			}),
		})

		if (!response.ok) {
			throw new Error(`Google Drive token exchange failed: ${response.status}`)
		}

		return response.json()
	}

	async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
		const config = this.getConfig()
		const response = await fetch(config.tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
				client_id: config.clientId,
			}),
		})

		if (!response.ok) {
			throw new Error(`Google Drive token refresh failed: ${response.status}`)
		}

		return response.json()
	}
}

export function getOAuth2Provider(type: 'dropbox' | 'google-drive'): OAuth2Provider {
	switch (type) {
		case 'dropbox':
			return new DropboxOAuth2Provider()
		case 'google-drive':
			return new GoogleDriveOAuth2Provider()
		default:
			throw new Error(`Unsupported OAuth2 provider: ${type}`)
	}
}

export function generateOAuth2State(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function buildOAuth2Url(provider: string, state: string): string {
	return `/api/storage/oauth2/authorize/${provider}?state=${state}`
}

export function storeOAuth2State(state: string, provider: string): void {
	sessionStorage.setItem(
		`oauth2_state_${state}`,
		JSON.stringify({ provider, timestamp: Date.now() })
	)
}

export function validateOAuth2State(state: string): { provider: string; valid: boolean } {
	const stored = sessionStorage.getItem(`oauth2_state_${state}`)
	if (!stored) return { provider: '', valid: false }

	try {
		const data = JSON.parse(stored)
		sessionStorage.removeItem(`oauth2_state_${state}`)

		// State is valid if it's less than 10 minutes old
		const valid = Date.now() - data.timestamp < 10 * 60 * 1000
		return { provider: data.provider, valid }
	} catch {
		return { provider: '', valid: false }
	}
}

export function initiateOAuth2Flow(provider: string): string {
	const state = generateOAuth2State()
	storeOAuth2State(state, provider)
	return buildOAuth2Url(provider, state)
}
