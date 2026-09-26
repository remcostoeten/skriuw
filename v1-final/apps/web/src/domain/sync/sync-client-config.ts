import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";

const STORAGE_KEY = "skriuw.sync.client.v1";

export type SyncClientConfig = {
	serverUrl: string;
	token: string;
	enabled: boolean;
	account?: { name: string; email: string; image: string | null };
	lastSyncedAt?: string;
	lastSnapshotIds?: { notes: string[]; folders: string[]; journalEntries: string[] };
};

type PersistedSyncConfig = Omit<SyncClientConfig, "token"> & { token?: string };

function parseMetadata(raw: string): PersistedSyncConfig | null {
	try {
		const parsed = JSON.parse(raw) as Partial<PersistedSyncConfig>;
		if (typeof parsed.serverUrl !== "string") return null;
		const config: PersistedSyncConfig = {
			serverUrl: parsed.serverUrl,
			enabled: parsed.enabled === true,
		};
		if (typeof parsed.token === "string") config.token = parsed.token;
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
		if (typeof parsed.lastSyncedAt === "string") config.lastSyncedAt = parsed.lastSyncedAt;
		const ids = parsed.lastSnapshotIds;
		if (
			ids &&
			Array.isArray(ids.notes) &&
			Array.isArray(ids.folders) &&
			Array.isArray(ids.journalEntries)
		) {
			config.lastSnapshotIds = ids;
		}
		return config;
	} catch {
		return null;
	}
}

/**
 * Loads sync metadata from localStorage and, on desktop, the bearer secret from
 * the OS credential store. Older desktop installs are migrated one-way: the
 * plaintext token is removed only after the keychain write succeeds.
 */
export async function getSyncClientConfig(): Promise<SyncClientConfig | null> {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	const metadata = parseMetadata(raw);
	if (!metadata) return null;

	if (!isTauriRuntime()) {
		if (!metadata.token) return null;
		return { ...metadata, token: metadata.token };
	}

	let token: string | null = null;
	if (metadata.token?.trim()) {
		// Legacy migration. A failed secure write deliberately leaves the old
		// value untouched for retry, but it is never used for a network request.
		await tauriInvoke<void>("sync_store_credential", { token: metadata.token });
		token = metadata.token.trim();
		const { token: _legacy, ...safeMetadata } = metadata;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeMetadata));
	} else {
		token = await tauriInvoke<string | null>("sync_load_credential");
	}
	if (!token) return null;
	const { token: _legacy, ...safeMetadata } = metadata;
	return { ...safeMetadata, token };
}

export async function clearSyncClientConfig(): Promise<void> {
	if (typeof window === "undefined") return;
	if (isTauriRuntime()) await tauriInvoke<void>("sync_clear_credential");
	window.localStorage.removeItem(STORAGE_KEY);
}

export async function setSyncClientConfig(config: SyncClientConfig): Promise<void> {
	if (typeof window === "undefined") return;
	if (isTauriRuntime()) {
		// Store and verify the credential before persisting metadata that says the
		// account is connected. This avoids a half-connected state after failure.
		await tauriInvoke<void>("sync_store_credential", { token: config.token });
		const { token: _secret, ...metadata } = config;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
		return;
	}
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
