import type { TQueueItem, TSettings } from "./types";

const DEFAULT_API_BASE = "https://skriuw.app";
const TOKEN_KEY = "skriuw.token";
const API_BASE_KEY = "skriuw.apiBase";
const PARENT_ID_KEY = "skriuw.parentId";
const OPEN_AFTER_SAVE_KEY = "skriuw.openAfterSave";
const QUEUE_KEY = "skriuw.queue";

export async function getSettings(): Promise<TSettings> {
	const local = await chrome.storage.local.get(TOKEN_KEY);
	const sync = await chrome.storage.sync.get([API_BASE_KEY, PARENT_ID_KEY, OPEN_AFTER_SAVE_KEY]);
	return {
		token: (local[TOKEN_KEY] as string | undefined) ?? "",
		apiBase: (sync[API_BASE_KEY] as string | undefined) ?? DEFAULT_API_BASE,
		parentId: (sync[PARENT_ID_KEY] as string | undefined) || null,
		openAfterSave: (sync[OPEN_AFTER_SAVE_KEY] as boolean | undefined) ?? false,
	};
}

export async function clearToken(): Promise<void> {
	await chrome.storage.local.remove(TOKEN_KEY);
}

export async function saveSettings(settings: TSettings): Promise<void> {
	await chrome.storage.local.set({ [TOKEN_KEY]: settings.token.trim() });
	await chrome.storage.sync.set({
		[API_BASE_KEY]: settings.apiBase.trim().replace(/\/$/, "") || DEFAULT_API_BASE,
		[PARENT_ID_KEY]: settings.parentId,
		[OPEN_AFTER_SAVE_KEY]: settings.openAfterSave,
	});
}

export async function saveCapturePreferences(input: {
	parentId: string | null;
	openAfterSave: boolean;
}): Promise<void> {
	await chrome.storage.sync.set({
		[PARENT_ID_KEY]: input.parentId,
		[OPEN_AFTER_SAVE_KEY]: input.openAfterSave,
	});
}

export async function readQueue(): Promise<TQueueItem[]> {
	const stored = await chrome.storage.local.get(QUEUE_KEY);
	return (stored[QUEUE_KEY] as TQueueItem[] | undefined) ?? [];
}

export async function writeQueue(items: TQueueItem[]): Promise<void> {
	await chrome.storage.local.set({ [QUEUE_KEY]: items });
}
