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
