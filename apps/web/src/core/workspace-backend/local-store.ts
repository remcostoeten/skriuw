"use client";

import type { NoteFile, NoteFolder } from "@/domain/notes/models";
import type { Person } from "@/domain/people/models";
import { noop } from "@/shared/lib/noop";
import { createWriteQueue } from "./write-queue";

export const WORKSPACE_STORAGE_KEY = "skriuw:guest:workspace:v2";

// The whole workspace is one blob, so every mutation rewrites the entire
// payload — all guest writes serialize on this single key. See `write-queue.ts`
// for how this shares one concurrency model with the desktop backend.
const GUEST_WRITE_KEY = "workspace";

const DB_NAME = "skriuw:guest:workspace";
const DB_VERSION = 1;
const OBJECT_STORE_NAME = "workspace";
const WORKSPACE_RECORD_KEY = "current";
const WORKSPACE_RECORD_VERSION = 1;

export type GuestTagMeta = {
	name: string;
	color: string | null;
};

export type GuestWorkspacePayload = {
	notes: NoteFile[];
	folders: NoteFolder[];
	people: Person[];
	tagMeta: GuestTagMeta[];
};

type StoredWorkspaceRecord = {
	key: typeof WORKSPACE_RECORD_KEY;
	version: typeof WORKSPACE_RECORD_VERSION;
	payload: GuestWorkspacePayload;
	updatedAt: number;
};

type StorageAdapter = {
	read(): Promise<GuestWorkspacePayload>;
	write(payload: GuestWorkspacePayload): Promise<void>;
	clear(): Promise<void>;
};

type UpdateDecision<Result> = {
	result: Result;
	shouldWrite: boolean;
};

export function emptyGuestWorkspacePayload(): GuestWorkspacePayload {
	return { notes: [], folders: [], people: [], tagMeta: [] };
}

function canUseLocalStorage(): boolean {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getIndexedDBFactory(): IDBFactory | null {
	if (typeof window !== "undefined" && window.indexedDB) {
		return window.indexedDB;
	}
	if (typeof indexedDB !== "undefined") {
		return indexedDB;
	}
	return null;
}

function reviveNote(raw: NoteFile): NoteFile {
	return {
		...raw,
		createdAt: new Date(raw.createdAt),
		modifiedAt: new Date(raw.modifiedAt),
		tags: Array.isArray(raw.tags) ? raw.tags : [],
	};
}

function normalizePayload(
	raw: Partial<GuestWorkspacePayload> | null | undefined,
): GuestWorkspacePayload {
	// Older payloads predate people/tagMeta — default them so existing guest
	// workspaces keep loading.
	return {
		notes: Array.isArray(raw?.notes) ? raw.notes.map(reviveNote) : [],
		folders: Array.isArray(raw?.folders) ? raw.folders : [],
		people: Array.isArray(raw?.people) ? raw.people : [],
		tagMeta: Array.isArray(raw?.tagMeta) ? raw.tagMeta : [],
	};
}

function clonePayload(payload: GuestWorkspacePayload): GuestWorkspacePayload {
	return {
		notes: payload.notes.map((note) => ({
			...note,
			createdAt: new Date(note.createdAt),
			modifiedAt: new Date(note.modifiedAt),
			tags: [...(note.tags ?? [])],
		})),
		folders: payload.folders.map((folder) => ({ ...folder })),
		people: payload.people.map((person) => ({ ...person })),
		tagMeta: payload.tagMeta.map((meta) => ({ ...meta })),
	};
}

function readLocalStoragePayload(): GuestWorkspacePayload {
	if (!canUseLocalStorage()) {
		return emptyGuestWorkspacePayload();
	}

	try {
		const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
		if (!raw) {
			return emptyGuestWorkspacePayload();
		}
		return normalizePayload(JSON.parse(raw) as Partial<GuestWorkspacePayload>);
	} catch {
		return emptyGuestWorkspacePayload();
	}
}

export function readGuestWorkspacePayloadFromLocalStorageSync(): GuestWorkspacePayload {
	return readLocalStoragePayload();
}

export function writeGuestWorkspacePayloadToLocalStorageSync(payload: GuestWorkspacePayload): void {
	if (!canUseLocalStorage()) return;
	try {
		window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Quota exceeded or storage disabled — fail silent; guest mode is best-effort.
		noop();
	}
}

export function clearGuestWorkspaceLocalStorageSync(): void {
	if (!canUseLocalStorage()) return;
	try {
		window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
	} catch {
		// ignore
		noop();
	}
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

function openRequest(factory: IDBFactory): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = factory.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
				database.createObjectStore(OBJECT_STORE_NAME, { keyPath: "key" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(request.error ?? new Error("IndexedDB open blocked"));
	});
}

function deleteDatabase(factory: IDBFactory): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = factory.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(request.error ?? new Error("IndexedDB delete blocked"));
	});
}

// A DB can exist at the current version WITHOUT the object store (an aborted
// first open leaves this state behind); `onupgradeneeded` then never fires
// again and every transaction throws NotFoundError. Detect it here and rebuild
// the DB once so guest writes don't fail silently forever.
async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
	const database = await openRequest(factory);
	if (database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
		return database;
	}
	database.close();
	await deleteDatabase(factory);
	const rebuilt = await openRequest(factory);
	if (!rebuilt.objectStoreNames.contains(OBJECT_STORE_NAME)) {
		rebuilt.close();
		throw new Error(
			`IndexedDB "${DB_NAME}" is missing the "${OBJECT_STORE_NAME}" store after rebuild`,
		);
	}
	return rebuilt;
}

function createLocalStorageAdapter(): StorageAdapter {
	return {
		async read() {
			return readGuestWorkspacePayloadFromLocalStorageSync();
		},
		async write(payload) {
			writeGuestWorkspacePayloadToLocalStorageSync(payload);
		},
		async clear() {
			clearGuestWorkspaceLocalStorageSync();
		},
	};
}

function createIndexedDBAdapter(database: IDBDatabase): StorageAdapter {
	return {
		async read() {
			const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
			const record = (await requestToPromise(
				transaction.objectStore(OBJECT_STORE_NAME).get(WORKSPACE_RECORD_KEY),
			)) as StoredWorkspaceRecord | undefined;
			await transactionDone(transaction);

			if (record?.version === WORKSPACE_RECORD_VERSION && record.payload) {
				return normalizePayload(record.payload);
			}

			return emptyGuestWorkspacePayload();
		},
		async write(payload) {
			const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
			const record: StoredWorkspaceRecord = {
				key: WORKSPACE_RECORD_KEY,
				version: WORKSPACE_RECORD_VERSION,
				payload,
				updatedAt: Date.now(),
			};
			transaction.objectStore(OBJECT_STORE_NAME).put(record);
			await transactionDone(transaction);
		},
		async clear() {
			const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
			transaction.objectStore(OBJECT_STORE_NAME).delete(WORKSPACE_RECORD_KEY);
			await transactionDone(transaction);
		},
	};
}

async function createStorageAdapter(): Promise<StorageAdapter> {
	const factory = getIndexedDBFactory();
	if (!factory) {
		return createLocalStorageAdapter();
	}

	try {
		const database = await openDatabase(factory);
		return createIndexedDBAdapter(database);
	} catch (error) {
		console.error(
			"Guest workspace: IndexedDB unavailable, falling back to localStorage",
			error,
		);
		return createLocalStorageAdapter();
	}
}

export class GuestWorkspaceStore {
	private adapterPromise: Promise<StorageAdapter> | null = null;
	private payloadPromise: Promise<GuestWorkspacePayload> | null = null;
	private payload: GuestWorkspacePayload | null = null;
	private queue = createWriteQueue();

	async read(): Promise<GuestWorkspacePayload> {
		return clonePayload(await this.load());
	}

	async update<Result>(
		mutator: (payload: GuestWorkspacePayload) => Result | Promise<Result>,
	): Promise<Result> {
		return this.updateMaybe(async (payload) => ({
			result: await mutator(payload),
			shouldWrite: true,
		}));
	}

	async updateMaybe<Result>(
		mutator: (
			payload: GuestWorkspacePayload,
		) => UpdateDecision<Result> | Promise<UpdateDecision<Result>>,
	): Promise<Result> {
		return this.queue.runExclusive(GUEST_WRITE_KEY, async () => {
			const payload = clonePayload(await this.load());
			const { result, shouldWrite } = await mutator(payload);
			if (!shouldWrite) return result;

			const normalized = normalizePayload(payload);
			this.payload = normalized;
			await (await this.getAdapter()).write(normalized);
			return result;
		});
	}

	async clear(): Promise<void> {
		return this.queue.runExclusive(GUEST_WRITE_KEY, async () => {
			this.payload = emptyGuestWorkspacePayload();
			this.payloadPromise = Promise.resolve(this.payload);
			await (await this.getAdapter()).clear();
		});
	}

	private async load(): Promise<GuestWorkspacePayload> {
		if (this.payload) return this.payload;
		if (!this.payloadPromise) {
			this.payloadPromise = this.getAdapter()
				.then((adapter) => adapter.read())
				.then((payload) => {
					this.payload = normalizePayload(payload);
					return this.payload;
				});
		}
		return this.payloadPromise;
	}

	private getAdapter(): Promise<StorageAdapter> {
		if (!this.adapterPromise) {
			this.adapterPromise = createStorageAdapter();
		}
		return this.adapterPromise;
	}
}

export function createGuestWorkspaceStore(): GuestWorkspaceStore {
	return new GuestWorkspaceStore();
}

let sharedStore: GuestWorkspaceStore | null = null;

/**
 * The shared guest store. Runtime writes (the backend) and boot reads (the
 * seed merge) must go through the SAME instance: each instance picks its
 * storage adapter independently, so two instances can silently target
 * different backing stores (IndexedDB vs the localStorage fallback) and lose
 * edits across reloads.
 */
export function getGuestWorkspaceStore(): GuestWorkspaceStore {
	if (!sharedStore) {
		sharedStore = createGuestWorkspaceStore();
	}
	return sharedStore;
}

/** Drops the shared store so each test starts from a fresh adapter + payload. */
export function resetGuestWorkspaceStoreForTests(): void {
	sharedStore = null;
}

export async function clearGuestWorkspaceIndexedDB(): Promise<void> {
	const factory = getIndexedDBFactory();
	if (!factory) return;
	const database = await openDatabase(factory);
	try {
		await createIndexedDBAdapter(database).clear();
	} finally {
		database.close();
	}
}
