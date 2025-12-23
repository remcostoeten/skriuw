import { AUTH_CLIENT_ENABLED } from '@/lib/auth-client'

export type LinkedAccount = {
	id: string
	providerId: string
	accountId: string
	createdAt: string
	updatedAt: string
	scopes: string[]
}

export type LinkResponse = {
	url: string
	redirect: boolean
}

export type DeleteResponse = {
	success: boolean
	message: string
}

const AUTH_API_BASE = '/api/auth'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function extractErrorMessage(payload: unknown, fallback: string): string {
	if (!isRecord(payload)) return fallback
	const direct = payload.message
	if (typeof direct === 'string' && direct.trim().length > 0) {
		return direct
	}
	const nested = payload.error
	if (isRecord(nested)) {
		const nestedMessage = nested.message
		if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
			return nestedMessage
		}
	}
	return fallback
}

async function parseJson<T>(response: Response): Promise<T> {
	const contentType = response.headers.get('content-type')
	if (!contentType || !contentType.includes('application/json')) {
		return {} as T
	}
	const body = await response.json()
	return body as T
}

async function readError(response: Response): Promise<Error> {
	const fallback = response.statusText || 'Request failed'
	try {
		const body = await response.json()
		const message = extractErrorMessage(body, fallback)
		return new Error(message)
	} catch (error) {
		return new Error(fallback)
	}
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
	const headers: HeadersInit = init.headers || {}
	const needsJson = init.body && !(init.body instanceof FormData)
	const mergedHeaders = needsJson
		? { 'content-type': 'application/json', ...headers }
		: headers

	const response = await fetch(url, {
		...init,
		headers: mergedHeaders,
		credentials: 'include',
		cache: 'no-store'
	})

	if (!response.ok) {
		throw await readError(response)
	}

	return parseJson<T>(response)
}

export async function getLinkedAccounts(): Promise<LinkedAccount[]> {
	if (!AUTH_CLIENT_ENABLED) return []
	return request<LinkedAccount[]>(`${AUTH_API_BASE}/list-accounts`, {
		method: 'GET'
	})
}

export async function linkAccount(
	provider: string,
	callbackURL: string
): Promise<LinkResponse> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	return request<LinkResponse>(`${AUTH_API_BASE}/link-social`, {
		method: 'POST',
		body: JSON.stringify({
			provider,
			callbackURL,
			disableRedirect: true
		})
	})
}

export async function unlinkAccount(
	providerId: string,
	accountId?: string
): Promise<boolean> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	const result = await request<{ status: boolean }>(
		`${AUTH_API_BASE}/unlink-account`,
		{
			method: 'POST',
			body: JSON.stringify({
				providerId,
				accountId
			})
		}
	)
	return Boolean(result.status)
}

export async function updateProfile(fields: {
	name?: string
	image?: string | null
}): Promise<boolean> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	const result = await request<{ status: boolean }>(
		`${AUTH_API_BASE}/update-user`,
		{
			method: 'POST',
			body: JSON.stringify(fields)
		}
	)
	return Boolean(result.status)
}

export async function deleteAccount(): Promise<DeleteResponse> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	return request<DeleteResponse>(`${AUTH_API_BASE}/delete-user`, {
		method: 'POST'
	})
}
