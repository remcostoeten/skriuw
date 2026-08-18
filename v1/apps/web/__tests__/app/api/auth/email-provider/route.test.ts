import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { NextRequest } from "next/server";

let rateLimitAllowed = true;

mock.module("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: rateLimitAllowed }),
	getRequestIp: () => "127.0.0.1",
}));

let post: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
	const route = await import("@/app/api/auth/email-provider/route");
	post = route.POST;
});

afterAll(() => {
	mock.restore();
});

describe("POST /api/auth/email-provider", () => {
	test("returns the same neutral response without inspecting the email", async () => {
		rateLimitAllowed = true;
		const request = new Request("http://localhost/api/auth/email-provider", {
			method: "POST",
			body: JSON.stringify({ email: "oauth-only@example.com" }),
		});

		const response = await post(request as NextRequest);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			exists: false,
			hasPassword: false,
			providers: [],
		});
	});

	test("preserves rate limiting", async () => {
		rateLimitAllowed = false;
		const request = new Request("http://localhost/api/auth/email-provider", {
			method: "POST",
		});

		const response = await post(request as NextRequest);

		expect(response.status).toBe(429);
		expect(await response.json()).toEqual({ error: "Too many requests." });
	});
});
