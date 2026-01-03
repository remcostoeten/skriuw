import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/api-auth'
import { OAUTH2_CONFIGS } from '@/lib/storage/oauth2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
	return NextResponse.json({ ok: false, message }, { status })
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ type: string }> }
) {
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
						prompt: 'consent'
					})
				})
		)

		// Set state cookie for verification
		response.cookies.set(`oauth2_state_${type}`, state, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 10 // 10 minutes
		})

		return response
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'OAuth2 initiation failed'
		console.error('OAuth2 initiation failed:', message)
		return jsonError(message, 500)
	}
}
