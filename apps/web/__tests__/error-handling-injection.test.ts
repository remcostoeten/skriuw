import { describe, expect, test, spyOn } from "bun:test";
import { cloneRichDocument } from "@/domain/notes/rich-document";
import { verifyCollabToken } from "@/features/collaboration/lib/collab-token";
import type { RichTextDocument } from "@/types/notes";

describe("Error handling injection tests", () => {
	describe("cloneRichDocument", () => {
		test("falls back to JSON serialization when structuredClone fails", () => {
			const original: RichTextDocument = [
				{
					id: "b1",
					type: "paragraph",
					props: {},
					content: [{ type: "text", text: "test", styles: {} }],
					children: [],
				},
			];

			const structuredCloneSpy = spyOn(globalThis, "structuredClone");
			structuredCloneSpy.mockImplementation(() => {
				throw new Error("Structured clone failed");
			});

			const consoleSpy = spyOn(console, "error");

			try {
				const cloned = cloneRichDocument(original);

				expect(consoleSpy).toHaveBeenCalledWith(
					expect.stringContaining("[cloneRichDocument]"),
					expect.any(Error),
				);
				expect(cloned).toEqual(original);
				expect(cloned).not.toBe(original);
				expect(cloned[0]).not.toBe(original[0]);
			} finally {
				structuredCloneSpy.mockRestore();
				consoleSpy.mockRestore();
			}
		});

		test("recovers via structuredClone when JSON serialization fails", () => {
			const original: RichTextDocument = [
				{
					id: "b1",
					type: "paragraph",
					props: {},
					content: [{ type: "text", text: "test", styles: {} }],
					children: [],
				},
			];

			const stringifySpy = spyOn(JSON, "stringify");
			stringifySpy.mockImplementation(() => {
				throw new Error("Stringify failed intentionally");
			});

			const consoleSpy = spyOn(console, "error");

			try {
				const cloned = cloneRichDocument(original);

				expect(consoleSpy).not.toHaveBeenCalled();
				expect(cloned).toEqual(original);
				expect(cloned).not.toBe(original);
			} finally {
				stringifySpy.mockRestore();
				consoleSpy.mockRestore();
			}
		});
	});

	describe("verifyCollabToken", () => {
		test("handles malformed token shape gracefully", async () => {
			const malformed = "not-a-token";
			const result = await verifyCollabToken(malformed, "secret");
			expect(result).toBeNull();
		});

		test("handles invalid JSON payload gracefully", async () => {
			const encoder = new TextEncoder();

			function toBase64Url(bytes: Uint8Array): string {
				let binary = "";
				for (const byte of bytes) binary += String.fromCharCode(byte);
				return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
			}

			// Invalid JSON payload that will fail to parse
			const invalidPayload = toBase64Url(encoder.encode("{ not valid json"));
			const token = `${invalidPayload}.signature`;

			const consoleSpy = spyOn(console, "error");

			const result = await verifyCollabToken(token, "secret");

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[decodeCollabToken]"),
				expect.any(Error),
			);
			expect(result).toBeNull();

			consoleSpy.mockRestore();
		});

		test("rejects expired tokens", async () => {
			const payload = {
				noteId: "note-1",
				userId: "user-1",
				name: "Test User",
				color: "#000000",
				role: "editor" as const,
				exp: Date.now() - 1000,
			};

			const encoder = new TextEncoder();

			function toBase64Url(bytes: Uint8Array): string {
				let binary = "";
				for (const byte of bytes) binary += String.fromCharCode(byte);
				return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
			}

			const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
			const token = `${body}.invalidsignature`;

			const result = await verifyCollabToken(token, "secret");
			expect(result).toBeNull();
		});
	});
});
