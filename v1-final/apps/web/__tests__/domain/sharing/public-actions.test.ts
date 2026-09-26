import { afterEach, describe, expect, mock, test } from "bun:test";

let openShareCalls: Array<{ token: string; password?: string }> = [];

function registerMocks() {
	mock.module("@/domain/sharing/public", () => ({
		openShare: async (input: { token: string; password?: string }) => {
			openShareCalls.push(input);
			return {
				status: "ok",
				snapshot: {
					noteId: "note-1",
					name: "shared-note.md",
					content: "Hello",
					richContent: null,
					preferredEditorMode: "block",
					sharedAt: "2026-06-19T10:00:00.000Z",
					author: null,
				},
			};
		},
	}));
}

afterEach(() => {
	mock.restore();
	openShareCalls = [];
});

describe("openPublicShare", () => {
	test("normalizes tokens before opening the share", async () => {
		registerMocks();
		const { openPublicShare } = await import(
			`@/domain/sharing/public-actions?test=${Math.random().toString(36).slice(2)}`
		);

		await expect(
			openPublicShare({ token: "  AbcD-12_ef  ", password: "secret" }),
		).resolves.toMatchObject({
			status: "ok",
		});
		expect(openShareCalls).toEqual([{ token: "AbcD-12_ef", password: "secret" }]);
	});

	test("rejects malformed tokens without calling the share resolver", async () => {
		registerMocks();
		const { openPublicShare } = await import(
			`@/domain/sharing/public-actions?test=${Math.random().toString(36).slice(2)}`
		);

		await expect(openPublicShare({ token: "not a valid token" })).resolves.toEqual({
			status: "not-found",
		});
		expect(openShareCalls).toHaveLength(0);
	});

	test("rejects oversized passwords without calling the share resolver", async () => {
		registerMocks();
		const { openPublicShare } = await import(
			`@/domain/sharing/public-actions?test=${Math.random().toString(36).slice(2)}`
		);

		await expect(
			openPublicShare({ token: "AbcD-12_ef", password: "x".repeat(129) }),
		).resolves.toEqual({
			status: "wrong-password",
		});
		expect(openShareCalls).toHaveLength(0);
	});
});
