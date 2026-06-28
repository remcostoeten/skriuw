/**
 * Persists the desktop app's "pull" sync connection (server URL + bearer token)
 * in the webview's localStorage. The token is a scoped, read-only,
 * individually-revocable credential (see /api/sync/tokens), but it is stored in
 * plaintext — a follow-up could move it into the OS keychain via a Rust command
 * the way AI provider keys are handled.
 */

const STORAGE_KEY = "skriuw.sync.client.v1";

export type SyncClientConfig = {
	serverUrl: string;
	token: string;
};

export function getSyncClientConfig(): SyncClientConfig | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<SyncClientConfig>;
		if (typeof parsed.serverUrl !== "string" || typeof parsed.token !== "string") {
			return null;
		}
		return { serverUrl: parsed.serverUrl, token: parsed.token };
	} catch {
		return null;
	}
}

export function setSyncClientConfig(config: SyncClientConfig): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearSyncClientConfig(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(STORAGE_KEY);
}
