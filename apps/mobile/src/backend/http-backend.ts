// ---------------------------------------------------------------------------
// http-backend.ts — mobileBackend
//
// The structural heart of the port: the 4th WorkspaceBackend implementation.
// It calls the NEW /api/workspace/* REST layer over HTTPS. Session auth is
// carried by the cookie the Better Auth Expo client persists in SecureStore.
//
// Reference implementation: apps/web/src/core/workspace-backend/tauri-backend.ts
// (wire mapping + write-queue + capability declaration).
//
// Design notes baked in:
//   - list responses are metadata only; bodies are fetched per note.
//   - PATCH sends `If-Unmodified-Since`-style precondition (expectedUpdatedAt)
//     -> 409 maps to ConflictError (conflict detection now, sync later).
//   - POST sends an Idempotency-Key (same pattern as /api/sync/capture).
//   - writes are serialized per note id via WriteQueue.
// ---------------------------------------------------------------------------

import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/lib/config";
import { getSessionCookie } from "@/auth/auth-client";
import { WriteQueue } from "@/backend/write-queue";
import {
	ConflictError,
	MOBILE_CAPABILITIES,
	type Capabilities,
	type CreateJournalEntryInput,
	type CreateFolderInput,
	type CreateNoteInput,
	type Folder,
	type JournalEntry,
	type Note,
	type NoteSummary,
	type SearchResult,
	type UpdateFolderInput,
	type UpdateJournalEntryInput,
	type UpdateNoteInput,
	type WorkspaceBackend,
} from "@/backend/types";

class HttpWorkspaceBackend implements WorkspaceBackend {
	readonly mode = "mobile" as const;
	readonly capabilities: Capabilities = MOBILE_CAPABILITIES;

	private readonly baseUrl = getApiBaseUrl();
	private readonly queue = new WriteQueue();

	private async request<T>(path: string, init?: RequestInit): Promise<T> {
		const isWeb = Platform.OS === "web";
		const res = await fetch(`${this.baseUrl}/api/workspace${path}`, {
			...init,
			// Browsers own their cookie jar and forbid setting Cookie manually. The
			// native Expo client has no cookie jar, so it keeps sending the cookie
			// persisted by @better-auth/expo instead.
			credentials: isWeb ? "include" : init?.credentials,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				...(isWeb ? {} : { Cookie: getSessionCookie() }),
				...init?.headers,
			},
		});

		if (res.status === 409) {
			const body = (await res.json().catch(() => ({}))) as { updatedAt?: string };
			throw new ConflictError(body.updatedAt);
		}
		if (res.status === 401) {
			throw new Error("UNAUTHENTICATED");
		}
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Request failed (${res.status}): ${text}`);
		}
		if (res.status === 204) return undefined as T;
		return (await res.json()) as T;
	}

	// --- Notes ---------------------------------------------------------------

	listNotes(folderId?: string | null): Promise<NoteSummary[]> {
		const qs =
			folderId === undefined
				? ""
				: `?folderId=${folderId === null ? "root" : encodeURIComponent(folderId)}`;
		return this.request<NoteSummary[]>(`/notes${qs}`);
	}

	getNote(id: string): Promise<Note> {
		return this.request<Note>(`/notes/${encodeURIComponent(id)}`);
	}

	createNote(input: CreateNoteInput): Promise<Note> {
		return this.request<Note>("/notes", {
			method: "POST",
			headers: { "Idempotency-Key": randomUUID() },
			body: JSON.stringify(input),
		});
	}

	updateNote(input: UpdateNoteInput): Promise<Note> {
		// Serialize writes per note so autosaves apply in order.
		return this.queue.enqueue(input.id, () => {
			const { id, expectedUpdatedAt, ...patch } = input;
			return this.request<Note>(`/notes/${encodeURIComponent(id)}`, {
				method: "PATCH",
				headers: expectedUpdatedAt
					? { "If-Unmodified-Since": expectedUpdatedAt }
					: undefined,
				body: JSON.stringify(patch),
			});
		});
	}

	deleteNote(id: string): Promise<void> {
		return this.queue.enqueue(id, () =>
			this.request<void>(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
		);
	}

	// --- Folders -------------------------------------------------------------

	listFolders(): Promise<Folder[]> {
		return this.request<Folder[]>("/folders");
	}

	createFolder(input: CreateFolderInput): Promise<Folder> {
		return this.request<Folder>("/folders", {
			method: "POST",
			body: JSON.stringify(input),
		});
	}

	updateFolder(input: UpdateFolderInput): Promise<Folder> {
		return this.queue.enqueue(input.id, () => {
			const { id, ...patch } = input;
			return this.request<Folder>(`/folders/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(patch),
			});
		});
	}

	deleteFolder(id: string): Promise<void> {
		return this.queue.enqueue(id, () =>
			this.request<void>(`/folders/${encodeURIComponent(id)}`, { method: "DELETE" }),
		);
	}

	// --- Search --------------------------------------------------------------

	search(query: string): Promise<SearchResult[]> {
		return this.request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
	}

	listJournalEntries(): Promise<JournalEntry[]> {
		return this.request<JournalEntry[]>("/journal");
	}

	createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
		return this.request<JournalEntry>("/journal", {
			method: "POST",
			headers: { "Idempotency-Key": randomUUID() },
			body: JSON.stringify(input),
		});
	}

	updateJournalEntry(input: UpdateJournalEntryInput): Promise<JournalEntry> {
		return this.queue.enqueue(`journal:${input.id}`, () => {
			const { id, ...patch } = input;
			return this.request<JournalEntry>(`/journal/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(patch),
			});
		});
	}

	deleteJournalEntry(id: string): Promise<void> {
		return this.queue.enqueue(`journal:${id}`, () =>
			this.request<void>(`/journal/${encodeURIComponent(id)}`, { method: "DELETE" }),
		);
	}
}

/** Singleton — mobile constructs its backend directly (unlike web's
 *  tauri→server→guest selection in context.tsx). */
export const mobileBackend: WorkspaceBackend = new HttpWorkspaceBackend();
