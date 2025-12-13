import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/api-auth'
import { env } from '@skriuw/env/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const OAUTH2_CONFIGS = {
	dropbox: {
		authUrl: 'https://www.dropbox.com/oauth2/authorize',
		tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
		clientId: env.NEXT_PUBLIC_DROPBOX_CLIENT_ID!,
		clientSecret: env.DROPBOX_CLIENT_SECRET!,
		redirectUri: `${env.NEXT_PUBLIC_APP_URL}/api/storage/oauth2/callback/dropbox`,
		scope: '',
	},
	'google-drive': {
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		clientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
		clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
		redirectUri: `${env.NEXT_PUBLIC_APP_URL}/api/storage/oauth2/callback/google-drive`,
		scope: 'https://www.googleapis.com/auth/drive.file',
	},
}

function jsonError(message: string, status = 400) {
	return NextResponse.json({ ok: false, message }, { status })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response

		const { type } = await params
		const config = OAUTH2_CONFIGS[type as keyof typeof OAUTH2_CONFIGS]

		if (!config) {
			return jsonError(`Unknown OAuth2 provider: ${type}`, 404)
		}

		// Generate state for CSRF protection
		const state = crypto.randomUUID()

		// Store state in session/cookie for verification
		const response = NextResponse.redirect(
			`${config.authUrl}?` +
			new URLSearchParams({
				client_id: config.clientId,
				redirect_uri: config.redirectUri,
				response_type: 'code',
				state,
				...(config.scope && { scope: config.scope }),
				...(type === 'google-drive' && {
					access_type: 'offline',
					prompt: 'consent',
				}),
			})
		)

		// Set state cookie for verification
		response.cookies.set(`oauth2_state_${type}`, state, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 10, // 10 minutes
		})

		return response
	} catch (error) {
		const message = error instanceof Error ? error.message : 'OAuth2 initiation failed'
		console.error('OAuth2 initiation failed:', message)
		return jsonError(message, 500)
	}
}
