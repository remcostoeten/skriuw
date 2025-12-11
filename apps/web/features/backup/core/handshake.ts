import { createHash, createHmac } from 'crypto'

import { validateConnectorConfig } from './validation'
import type { StorageConnectorType } from './types'

export type HandshakeResult = { ok: true; message: string }

function formatAmzDate(date: Date) {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

async function testS3(config: Record<string, string>): Promise<HandshakeResult> {
	const { accessKeyId, secretAccessKey, region, bucket, endpoint } = config
	const host = endpoint ? new URL(endpoint).host : `${bucket}.s3.${region}.amazonaws.com`
	const url = endpoint ? `${endpoint.replace(/\/$/, '')}/${bucket}` : `https://${host}/`

	const method = 'HEAD'
	const service = 's3'
	const amzDate = formatAmzDate(new Date())
	const dateStamp = amzDate.slice(0, 8)

	const canonicalUri = '/'
	const canonicalQuery = ''
	const canonicalHeaders =
		`host:${host}\n` + `x-amz-content-sha256:UNSIGNED-PAYLOAD\n` + `x-amz-date:${amzDate}\n`
	const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
	const payloadHash = 'UNSIGNED-PAYLOAD'
	const canonicalRequest = [
		method,
		canonicalUri,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join('\n')

	const algorithm = 'AWS4-HMAC-SHA256'
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
	const stringToSign = [
		algorithm,
		amzDate,
		credentialScope,
		createHash('sha256').update(canonicalRequest).digest('hex'),
	].join('\n')

	const kDate = createHmac('sha256', 'AWS4' + secretAccessKey).update(dateStamp).digest()
	const kRegion = createHmac('sha256', kDate).update(region).digest()
	const kService = createHmac('sha256', kRegion).update(service).digest()
	const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
	const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

	const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

	const res = await fetch(url, {
		method,
		headers: {
			host,
			'x-amz-date': amzDate,
			'x-amz-content-sha256': payloadHash,
			Authorization: authorization,
		},
	})

	if (!res.ok) {
		const text = await res.text()
		throw new Error(`S3 handshake failed: ${res.status} ${text.slice(0, 120)}`)
	}

	return { ok: true, message: 'S3 connection verified' }
}

async function testDropbox(config: Record<string, string>): Promise<HandshakeResult> {
	const { accessToken } = config
	const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
	})
	if (!res.ok) {
		const text = await res.text()
		throw new Error(`Dropbox handshake failed: ${res.status} ${text.slice(0, 120)}`)
	}
	return { ok: true, message: 'Dropbox connection verified' }
}

async function testDrive(config: Record<string, string>): Promise<HandshakeResult> {
	const { clientId, clientSecret, refreshToken } = config
	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		}),
	})
	if (!tokenRes.ok) {
		const text = await tokenRes.text()
		throw new Error(`Drive token exchange failed: ${tokenRes.status} ${text.slice(0, 120)}`)
	}
	const tokenJson = (await tokenRes.json()) as { access_token?: string }
	if (!tokenJson.access_token) {
		throw new Error('Drive token exchange returned no access token')
	}
	const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,emailAddress', {
		headers: { Authorization: `Bearer ${tokenJson.access_token}` },
	})
	if (!aboutRes.ok) {
		const text = await aboutRes.text()
		throw new Error(`Drive handshake failed: ${aboutRes.status} ${text.slice(0, 120)}`)
	}
	return { ok: true, message: 'Google Drive connection verified' }
}

export async function runConnectorHandshake(
	type: StorageConnectorType,
	config: Record<string, string>
): Promise<HandshakeResult> {
	const validated = validateConnectorConfig(type, config)
	switch (type) {
		case 's3':
			return testS3(validated)
		case 'dropbox':
			return testDropbox(validated)
		case 'google-drive':
			return testDrive(validated)
		default:
			throw new Error(`Unsupported provider: ${type}`)
	}
}
