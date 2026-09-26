import { describe, expect, test } from "bun:test";
import { createRawSyncToken, readBearerToken } from "@/domain/sync/token-utils";

describe("sync token helpers", () => {
	test("creates desktop sync tokens with the expected prefix and entropy", () => {
		const token = createRawSyncToken();

		expect(token.startsWith("skriuw_sync_")).toBe(true);
		expect(token.length).toBeGreaterThan(50);
	});

	test("reads bearer tokens from Authorization headers", () => {
		const request = new Request("https://example.test/api/sync/export", {
			headers: { authorization: "Bearer skriuw_sync_example" },
		});

		expect(readBearerToken(request)).toBe("skriuw_sync_example");
		expect(readBearerToken(new Request("https://example.test"))).toBeNull();
		expect(
			readBearerToken(
				new Request("https://example.test", {
					headers: { authorization: "Basic nope" },
				}),
			),
		).toBeNull();
	});
});
