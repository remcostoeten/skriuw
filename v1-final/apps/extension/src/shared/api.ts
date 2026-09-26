import { clearToken, getSettings } from "./storage";
import type {
	TCapturePayload,
	TCaptureResponse,
	TFolderSummary,
	TSyncEventSummary,
	TTokenInfo,
} from "./types";

export type TCaptureOutcome =
	| { ok: true; data: TCaptureResponse }
	| { ok: false; status: number; error: string; retryable: boolean };

/**
 * POSTs a clip to the Skriuw capture endpoint. Network errors and 5xx are
 * flagged `retryable` so the background queue can back off and try again;
 * 4xx are terminal (bad token, validation) and surfaced to the user.
 */
export async function postCapture(
	payload: TCapturePayload,
	idempotencyKey: string,
): Promise<TCaptureOutcome> {
	const { apiBase, token } = await getSettings();
	if (!token) {
		return { ok: false, status: 0, error: "No API token configured.", retryable: false };
	}

	try {
		const response = await fetch(`${apiBase}/api/sync/capture`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"Idempotency-Key": idempotencyKey,
			},
			body: JSON.stringify(payload),
		});

		if (response.ok) {
			return { ok: true, data: (await response.json()) as TCaptureResponse };
		}

		if (response.status === 401) {
			await clearToken();
		}

		const body = (await response.json().catch(() => ({}))) as { error?: string };
		return {
			ok: false,
			status: response.status,
			error: body.error ?? `Request failed (${response.status}).`,
			retryable: response.status >= 500 || response.status === 429,
		};
	} catch (error) {
		return {
			ok: false,
			status: 0,
			error: error instanceof Error ? error.message : "Network error.",
			retryable: true,
		};
	}
}

async function getWithToken<T>(path: string): Promise<T> {
	const { apiBase, token } = await getSettings();
	if (!token) {
		throw new Error("No API token configured.");
	}
	const response = await fetch(`${apiBase}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const body = (await response.json().catch(() => ({}))) as T & { error?: string };
	if (!response.ok) {
		if (response.status === 401) {
			await clearToken();
		}
		throw new Error(body.error ?? `Request failed (${response.status}).`);
	}
	return body;
}

export async function verifyToken(): Promise<TTokenInfo> {
	const body = await getWithToken<{ token: TTokenInfo }>("/api/sync/verify");
	return body.token;
}

/** Checks a not-yet-saved token before it's written to storage (options "Test & save" flow). */
export async function verifyRawToken(apiBase: string, token: string): Promise<TTokenInfo> {
	const response = await fetch(`${apiBase}/api/sync/verify`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const body = (await response.json().catch(() => ({}))) as {
		token?: TTokenInfo;
		error?: string;
	};
	if (!response.ok || !body.token) {
		throw new Error(body.error ?? `Token check failed (${response.status}).`);
	}
	return body.token;
}

export async function listFolders(): Promise<TFolderSummary[]> {
	const body = await getWithToken<{ folders: TFolderSummary[] }>("/api/sync/folders");
	return body.folders;
}

export async function listActivity(limit = 8): Promise<TSyncEventSummary[]> {
	const body = await getWithToken<{ events: TSyncEventSummary[] }>(
		`/api/sync/activity?limit=${limit}`,
	);
	return body.events;
}
