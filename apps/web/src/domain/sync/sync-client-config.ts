const STORAGE_KEY = "skriuw.sync.client.v1";

export type SyncClientConfig = {
	serverUrl: string;
	token: string;
	enabled: boolean;
	account?: { name: string; email: string; image: string | null };
	lastSyncedAt?: string;
	lastSnapshotIds?: { notes: string[]; folders: string[]; journalEntries: string[] };
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
		const config: SyncClientConfig = {
			serverUrl: parsed.serverUrl,
			token: parsed.token,
			enabled: parsed.enabled === true,
		};
		if (
			parsed.account &&
			typeof parsed.account.name === "string" &&
			typeof parsed.account.email === "string"
		) {
			config.account = {
				name: parsed.account.name,
				email: parsed.account.email,
				image: typeof parsed.account.image === "string" ? parsed.account.image : null,
			};
		}
		if (typeof parsed.lastSyncedAt === "string") {
			config.lastSyncedAt = parsed.lastSyncedAt;
		}
		if (parsed.lastSnapshotIds && typeof parsed.lastSnapshotIds === "object") {
			const ids = parsed.lastSnapshotIds as SyncClientConfig["lastSnapshotIds"];
			if (
				ids &&
				Array.isArray(ids.notes) &&
				Array.isArray(ids.folders) &&
				Array.isArray(ids.journalEntries)
			) {
				config.lastSnapshotIds = ids;
			}
		}
		return config;
	} catch {
		return null;
	}
}

export function clearSyncClientConfig(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(STORAGE_KEY);
}

export function setSyncClientConfig(config: SyncClientConfig): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
