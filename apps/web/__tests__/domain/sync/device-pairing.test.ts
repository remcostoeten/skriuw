import { afterEach, describe, expect, test } from "bun:test";
import { beginDesktopPairing, finishDesktopPairing } from "@/domain/sync/device-pairing";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("desktop device pairing", () => {
	test("starts a browser authorization request without exposing a sync token", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (url) => {
			requestedUrl = String(url);
			return Response.json({
				device_code: "device-secret",
				user_code: "ABCD-EFGH",
				verification_uri_complete: "/connect/desktop?user_code=ABCD-EFGH",
				expires_in: 600,
				interval: 5,
			});
		}) as typeof fetch;

		const request = await beginDesktopPairing("https://example.com/path");

		expect(requestedUrl).toBe("https://example.com/api/sync/device/code");
		expect(request.userCode).toBe("ABCD-EFGH");
		expect(request.verificationUrl).toBe(
			"https://example.com/connect/desktop?user_code=ABCD-EFGH",
		);
	});

	test("polls the approved device session and exchanges it for desktop sync access", async () => {
		const calls: Array<{ url: string; authorization?: string }> = [];
		globalThis.fetch = (async (url, init) => {
			const headers = init?.headers as Record<string, string> | undefined;
			calls.push({ url: String(url), authorization: headers?.Authorization });
			if (String(url).endsWith("/token")) {
				return Response.json({ access_token: "browser-session" });
			}
			return Response.json({
				token: "sk_sync_desktop",
				account: { name: "Ada", email: "ada@example.com", image: null },
			});
		}) as typeof fetch;

		const result = await finishDesktopPairing({
			serverUrl: "https://example.com",
			deviceCode: "device-secret",
			userCode: "ABCD-EFGH",
			verificationUrl: "https://example.com/connect/desktop?user_code=ABCD-EFGH",
			expiresAt: Date.now() + 5_000,
			pollIntervalMs: 0,
		});

		expect(result.account.email).toBe("ada@example.com");
		expect(calls[1]?.authorization).toBe("Bearer browser-session");
	});
});
