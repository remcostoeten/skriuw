import { requireAuth } from "../../../../../lib/api-auth";
import { runConnectorHandshake } from "@/features/backup/core/handshake";
import type { StorageConnectorType } from "@/features/backup/core/types";
import { NextRequest, NextResponse } from "next/server";

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
		const oauth2Tokens = body?.oauth2Tokens
		const result = await runConnectorHandshake(type, rawConfig, oauth2Tokens)
		return NextResponse.json(result)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Handshake failed'
		console.error('Connector handshake failed:', message)
		return jsonError(message, 400)
	}
}
