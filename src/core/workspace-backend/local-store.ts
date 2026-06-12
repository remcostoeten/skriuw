"use client";

import type { NoteFile, NoteFolder } from "@/domain/notes/models";

export const WORKSPACE_STORAGE_KEY = "skriuw:guest:workspace:v2";

const DB_NAME = "skriuw:guest:workspace";
const DB_VERSION = 1;
const OBJECT_STORE_NAME = "workspace";
const WORKSPACE_RECORD_KEY = "current";
const WORKSPACE_RECORD_VERSION = 1;

export type GuestWorkspacePayload = {
	notes: NoteFile[];
	folders: NoteFolder[];
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
	return { notes: [], folders: [] };
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
		createdAt: new Date(raw.createdAt as unknown as string),
		modifiedAt: new Date(raw.modifiedAt as unknown as string),
		tags: Array.isArray(raw.tags) ? raw.tags : [],
	};
}

function normalizePayload(
	raw: Partial<GuestWorkspacePayload> | null | undefined,
): GuestWorkspacePayload {
	return {
		notes: Array.isArray(raw?.notes) ? raw.notes.map(reviveNote) : [],
		folders: Array.isArray(raw?.folders) ? raw.folders : [],
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
	}
}

export function clearGuestWorkspaceLocalStorageSync(): void {
	if (!canUseLocalStorage()) return;
	try {
		window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
	} catch {
		// ignore
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

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
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
	} catch {
		return createLocalStorageAdapter();
	}
}

export class GuestWorkspaceStore {
	private adapterPromise: Promise<StorageAdapter> | null = null;
	private payloadPromise: Promise<GuestWorkspacePayload> | null = null;
	private payload: GuestWorkspacePayload | null = null;
	private pending: Promise<void> = Promise.resolve();

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
		const operation = this.pending.then(async () => {
			const payload = clonePayload(await this.load());
			const { result, shouldWrite } = await mutator(payload);
			if (!shouldWrite) return result;

			const normalized = normalizePayload(payload);
			this.payload = normalized;
			await (await this.getAdapter()).write(normalized);
			return result;
		});

		this.pending = operation.then(
			() => undefined,
			() => undefined,
		);

		return operation;
	}

	async clear(): Promise<void> {
		const operation = this.pending.then(async () => {
			this.payload = emptyGuestWorkspacePayload();
			this.payloadPromise = Promise.resolve(this.payload);
			await (await this.getAdapter()).clear();
		});

		this.pending = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
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
