import { NextRequest, NextResponse } from 'next/server'

import type { StorageConnectorType } from '@/features/backup/core/types'
import { runConnectorHandshake } from '@/features/backup/core/handshake'
import { requireAuth } from '../../../../../lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
	return NextResponse.json({ ok: false, message }, { status })
}

export async function POST(request: NextRequest) {
	try {
		const auth = await requireAuth()
		if (!auth.authenticated) return auth.response

		const body = await request.json()
		const type = body?.type as StorageConnectorType
		if (!type) return jsonError('Missing provider type')
		const rawConfig = body?.config || {}
		const result = await runConnectorHandshake(type, rawConfig)
		return NextResponse.json({ ok: true, ...result })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Handshake failed'
		console.error('Connector handshake failed:', message)
		return jsonError(message, 400)
	}
}
