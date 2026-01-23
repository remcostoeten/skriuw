import { AUTH_CLIENT_ENABLED } from "@/lib/auth-client";
import { apiRequest } from "@/lib/storage/adapters/client-api";

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

export async function getLinkedAccounts(): Promise<LinkedAccount[]> {
	if (!AUTH_CLIENT_ENABLED) return []
	const result = await apiRequest<LinkedAccount[]>(`${AUTH_API_BASE}/list-accounts`, {
		method: 'GET',
		credentials: 'include'
	})
	return result ?? []
}

export async function linkAccount(provider: string, callbackURL: string): Promise<LinkResponse> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	const result = await apiRequest<LinkResponse>(`${AUTH_API_BASE}/link-social`, {
		method: 'POST',
		body: JSON.stringify({
			provider,
			callbackURL,
			disableRedirect: true
		}),
		credentials: 'include'
	})
	if (!result) throw new Error('Failed to initiate account linking')
	return result
}

export async function unlinkAccount(providerId: string, accountId?: string): Promise<boolean> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	const result = await apiRequest<{ status: boolean }>(`${AUTH_API_BASE}/unlink-account`, {
		method: 'POST',
		body: JSON.stringify({
			providerId,
			accountId
		}),
		credentials: 'include'
	})
	return Boolean(result?.status)
}

export async function updateProfile(fields: {
	name?: string
	image?: string | null
}): Promise<boolean> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	const result = await apiRequest<{ status: boolean }>(`${AUTH_API_BASE}/update-user`, {
		method: 'POST',
		body: JSON.stringify(fields),
		credentials: 'include'
	})
	return Boolean(result?.status)
}

export async function deleteAccount(): Promise<DeleteResponse> {
	if (!AUTH_CLIENT_ENABLED) {
		throw new Error('Authentication client not configured')
	}
	const result = await apiRequest<DeleteResponse>(`${AUTH_API_BASE}/delete-user`, {
		method: 'POST',
		credentials: 'include'
	})
	if (!result) return { success: true, message: 'Account deleted' }
	return result
}
