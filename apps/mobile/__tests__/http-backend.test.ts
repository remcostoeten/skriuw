// Wire-level tests for the mobile WorkspaceBackend: URL shapes, auth/idempotency
// headers, precondition handling, and error mapping — against a mocked fetch.
// Native modules (expo-crypto, react-native) are mocked so this runs under bun.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ConflictError as ConflictErrorInstance } from "../src/backend/types";

mock.module("expo-crypto", () => ({
	randomUUID: () => "00000000-0000-4000-8000-000000000000",
}));
mock.module("react-native", () => ({
	Platform: { OS: "ios" },
}));
mock.module("../src/lib/config", () => ({
	getApiBaseUrl: () => "https://api.test",
}));
mock.module("../src/auth/auth-client", () => ({
	getSessionCookie: () => "better-auth.session_token=abc",
}));

const { mobileBackend } = await import("../src/backend/http-backend");
const { ConflictError } = await import("../src/backend/types");

type RecordedRequest = { url: string; init: RequestInit };

let requests: RecordedRequest[];
let responder: (url: string, init: RequestInit) => Response;
const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	requests = [];
	responder = () => jsonResponse({});
	globalThis.fetch = ((url: string, init?: RequestInit) => {
		requests.push({ url, init: init ?? {} });
		return Promise.resolve(responder(url, init ?? {}));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

function lastRequest(): RecordedRequest {
	expect(requests.length).toBeGreaterThan(0);
	return requests[requests.length - 1]!;
}

function headersOf(request: RecordedRequest): Record<string, string> {
	return Object.fromEntries(
		Object.entries((request.init.headers ?? {}) as Record<string, string>).map(
			([key, value]) => [key.toLowerCase(), value],
		),
	);
}

describe("request plumbing", () => {
	test("sends the persisted session cookie on native", async () => {
		responder = () => jsonResponse([]);
		await mobileBackend.listNotes();
		expect(headersOf(lastRequest()).cookie).toBe("better-auth.session_token=abc");
	});

	test("maps 401 to UNAUTHENTICATED", async () => {
		responder = () => jsonResponse({ error: "Not authenticated" }, 401);
		await expect(mobileBackend.listNotes()).rejects.toThrow("UNAUTHENTICATED");
	});

	test("maps other failures to a status-carrying error", async () => {
		responder = () => new Response("nope", { status: 500 });
		await expect(mobileBackend.listNotes()).rejects.toThrow("Request failed (500): nope");
	});
});

describe("notes", () => {
	test("listNotes hits /notes and encodes the root sentinel", async () => {
		responder = () => jsonResponse([]);
		await mobileBackend.listNotes();
		expect(lastRequest().url).toBe("https://api.test/api/workspace/notes");

		await mobileBackend.listNotes(null);
		expect(lastRequest().url).toBe("https://api.test/api/workspace/notes?folderId=root");

		await mobileBackend.listNotes("folder/1");
		expect(lastRequest().url).toBe("https://api.test/api/workspace/notes?folderId=folder%2F1");
	});

	test("createNote POSTs with an Idempotency-Key", async () => {
		responder = () => jsonResponse({ id: "n1", folderId: null });
		await mobileBackend.createNote({ title: "Hello" });

		const request = lastRequest();
		expect(request.init.method).toBe("POST");
		expect(headersOf(request)["idempotency-key"]).toBe("00000000-0000-4000-8000-000000000000");
		expect(JSON.parse(request.init.body as string)).toEqual({ title: "Hello" });
	});

	test("updateNote sends If-Unmodified-Since when expectedUpdatedAt is set", async () => {
		responder = () => jsonResponse({ id: "n1", folderId: null });
		await mobileBackend.updateNote({
			id: "n1",
			content: "body",
			expectedUpdatedAt: "2026-07-14T00:00:00.000Z",
		});

		const request = lastRequest();
		expect(request.url).toBe("https://api.test/api/workspace/notes/n1");
		expect(request.init.method).toBe("PATCH");
		expect(headersOf(request)["if-unmodified-since"]).toBe("2026-07-14T00:00:00.000Z");
		expect(JSON.parse(request.init.body as string)).toEqual({ content: "body" });
	});

	test("409 maps to ConflictError carrying the server timestamp", async () => {
		responder = () => jsonResponse({ updatedAt: "2026-07-14T12:00:00.000Z" }, 409);
		const attempt = mobileBackend.updateNote({
			id: "n1",
			content: "body",
			expectedUpdatedAt: "2026-07-14T00:00:00.000Z",
		});

		await expect(attempt).rejects.toBeInstanceOf(ConflictError);
		await attempt.catch((error: ConflictErrorInstance) => {
			expect(error.serverUpdatedAt).toBe("2026-07-14T12:00:00.000Z");
		});
	});

	test("deleteNote resolves on 204 with no body", async () => {
		responder = () => new Response(null, { status: 204 });
		await expect(mobileBackend.deleteNote("n1")).resolves.toBeUndefined();
		expect(lastRequest().init.method).toBe("DELETE");
	});
});

describe("trash", () => {
	test("listTrash GETs /trash", async () => {
		responder = () => jsonResponse([]);
		await mobileBackend.listTrash();
		expect(lastRequest().url).toBe("https://api.test/api/workspace/trash");
	});

	test("restoreTrash PATCHes the encoded batch id", async () => {
		responder = () => new Response(null, { status: 204 });
		await mobileBackend.restoreTrash("note:abc");

		const request = lastRequest();
		expect(request.url).toBe("https://api.test/api/workspace/trash/note%3Aabc");
		expect(request.init.method).toBe("PATCH");
	});

	test("purgeTrash DELETEs the encoded batch id", async () => {
		responder = () => new Response(null, { status: 204 });
		await mobileBackend.purgeTrash("folder:xyz");

		const request = lastRequest();
		expect(request.url).toBe("https://api.test/api/workspace/trash/folder%3Axyz");
		expect(request.init.method).toBe("DELETE");
	});

	test("emptyTrash DELETEs the collection", async () => {
		responder = () => new Response(null, { status: 204 });
		await mobileBackend.emptyTrash();

		const request = lastRequest();
		expect(request.url).toBe("https://api.test/api/workspace/trash");
		expect(request.init.method).toBe("DELETE");
	});
});

describe("search and journal", () => {
	test("search URL-encodes the query", async () => {
		responder = () => jsonResponse([]);
		await mobileBackend.search("tag:#work & more");
		expect(lastRequest().url).toBe(
			"https://api.test/api/workspace/search?q=tag%3A%23work%20%26%20more",
		);
	});

	test("createJournalEntry POSTs with an Idempotency-Key", async () => {
		responder = () => jsonResponse({ id: "j1" });
		await mobileBackend.createJournalEntry({
			date: "2026-07-14",
			content: "today",
		} as never);

		const request = lastRequest();
		expect(request.url).toBe("https://api.test/api/workspace/journal");
		expect(headersOf(request)["idempotency-key"]).toBe("00000000-0000-4000-8000-000000000000");
	});
});
