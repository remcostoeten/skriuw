import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/api-auth'
import { OAUTH2_CONFIGS } from '@/lib/storage/oauth2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
	return NextResponse.json({ ok: false, message }, { status })
}

async function exchangeCodeForTokens(
	type: keyof typeof OAUTH2_CONFIGS,
	code: string
): Promise<{
	access_token: string
	refresh_token?: string
	expires_in?: number
}> {
	const config = OAUTH2_CONFIGS[type]

	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uri: config.redirectUri
		})
	})

	if (!response.ok) {
		const error = await response.text()
		throw new Error(`Token exchange failed: ${error}`)
	}

	return response.json()
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ type: string }> }
) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response

		const { type } = await params
		const oauthType = type as keyof typeof OAUTH2_CONFIGS
		const config = OAUTH2_CONFIGS[oauthType]

		if (!config) {
			return jsonError(`Unknown OAuth2 provider: ${type}`, 404)
		}

		const searchParams = request.nextUrl.searchParams
		const code = searchParams.get('code')
		const state = searchParams.get('state')
		const error = searchParams.get('error')

		// Handle OAuth2 errors
		if (error) {
			return NextResponse.redirect(
				`${process.env.NEXT_PUBLIC_APP_URL}/archive?error=${encodeURIComponent(error)}`
			)
		}

		if (!code || !state) {
			return jsonError('Missing authorization code or state', 400)
		}

		// Verify state to prevent CSRF
		const storedState = request.cookies.get(`oauth2_state_${type}`)?.value
		if (!storedState || storedState !== state) {
			return jsonError('Invalid state parameter', 400)
		}

		// Exchange code for tokens
		const tokens = await exchangeCodeForTokens(oauthType, code)

		// Here you would typically store the tokens in your database
		// For now, we'll redirect back with success and tokens in URL hash
		const redirectUrl = new URL(
			`${process.env.NEXT_PUBLIC_APP_URL}/archive`
		)
		redirectUrl.hash = new URLSearchParams({
			success: 'true',
			provider: type,
			access_token: tokens.access_token,
			...(tokens.refresh_token && {
				refresh_token: tokens.refresh_token
			}),
			...(tokens.expires_in && {
				expires_in: tokens.expires_in.toString()
			})
		}).toString()

		const response = NextResponse.redirect(redirectUrl.toString())

		// Clear the state cookie
		response.cookies.delete(`oauth2_state_${type}`)

		return response
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'OAuth2 callback failed'
		console.error('OAuth2 callback failed:', message)
		// Return JSON error for debugging visibility
		return jsonError(message, 500)
		/* 		return NextResponse.redirect(
					`${process.env.NEXT_PUBLIC_APP_URL}/archive?error=${encodeURIComponent(message)}`
				) */
	}
}
