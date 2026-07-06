/**
 * Persists the desktop app's sync connection (server URL + bearer token) in the
 * webview's localStorage, plus the timestamp of the last successful sync. The
 * token is a scoped, individually-revocable credential (see /api/sync/tokens):
 * a read-only token pulls, a read-write token is required to push or two-way
 * sync. It is stored in plaintext — a follow-up could move it into the OS
 * keychain via a Rust command the way AI provider keys are handled.
 */

const STORAGE_KEY = "skriuw.sync.client.v1";

export type SyncClientConfig = {
	serverUrl: string;
	token: string;
	lastSyncedAt?: string;
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
		const config: SyncClientConfig = { serverUrl: parsed.serverUrl, token: parsed.token };
		if (typeof parsed.lastSyncedAt === "string") {
			config.lastSyncedAt = parsed.lastSyncedAt;
		}
		return config;
	} catch {
		return null;
	}
}

export function setSyncClientConfig(config: SyncClientConfig): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function setLastSyncedAt(iso: string): void {
	if (typeof window === "undefined") return;
	const config = getSyncClientConfig();
	if (!config) return;
	setSyncClientConfig({ ...config, lastSyncedAt: iso });
}

export function clearSyncClientConfig(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(STORAGE_KEY);
}
