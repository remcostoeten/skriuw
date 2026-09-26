import { beforeEach, describe, expect, mock, test } from "bun:test";

let resolved: Array<{ address: string }>;

beforeEach(() => {
	resolved = [{ address: "93.184.216.34" }];
	mock.module("server-only", () => ({}));
	mock.module("node:dns/promises", () => ({
		lookup: async () => resolved,
	}));
});

async function loadModule() {
	return import(`@/lib/safe-fetch-ics?test=${Math.random().toString(36).slice(2)}`);
}

describe("normalizeSubscriptionUrl", () => {
	test("accepts https and rewrites webcal", async () => {
		const { normalizeSubscriptionUrl } = await loadModule();
		expect(normalizeSubscriptionUrl("https://example.com/cal.ics")).toBe(
			"https://example.com/cal.ics",
		);
		expect(normalizeSubscriptionUrl("webcal://example.com/cal.ics")).toBe(
			"https://example.com/cal.ics",
		);
	});

	test("rejects http, credentials, garbage, and dotless hosts", async () => {
		const { normalizeSubscriptionUrl } = await loadModule();
		expect(() => normalizeSubscriptionUrl("http://example.com/cal.ics")).toThrow();
		expect(() => normalizeSubscriptionUrl("https://user:pass@example.com/cal.ics")).toThrow();
		expect(() => normalizeSubscriptionUrl("not a url")).toThrow();
		expect(() => normalizeSubscriptionUrl("https://localhost/cal.ics")).toThrow();
	});
});

describe("isPrivateAddress", () => {
	test("flags loopback, private, link-local, and metadata ranges", async () => {
		const { isPrivateAddress } = await loadModule();
		for (const ip of [
			"127.0.0.1",
			"10.1.2.3",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"0.0.0.0",
			"::1",
			"fe80::1",
			"fd00::1",
			"::ffff:192.168.1.1",
		]) {
			expect(isPrivateAddress(ip)).toBe(true);
		}
	});

	test("allows public addresses", async () => {
		const { isPrivateAddress } = await loadModule();
		expect(isPrivateAddress("93.184.216.34")).toBe(false);
		expect(isPrivateAddress("2606:4700::1111")).toBe(false);
		expect(isPrivateAddress("172.32.0.1")).toBe(false);
	});
});

describe("fetchIcsFromUrl", () => {
	test("returns body for a public host", async () => {
		const { fetchIcsFromUrl } = await loadModule();
		const original = globalThis.fetch;
		globalThis.fetch = mock(
			async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
		) as unknown as typeof fetch;
		try {
			const text = await fetchIcsFromUrl("https://example.com/cal.ics");
			expect(text).toContain("BEGIN:VCALENDAR");
		} finally {
			globalThis.fetch = original;
		}
	});

	test("rejects hosts resolving to private addresses", async () => {
		resolved = [{ address: "10.0.0.5" }];
		const { fetchIcsFromUrl } = await loadModule();
		await expect(fetchIcsFromUrl("https://evil.example.com/cal.ics")).rejects.toThrow(
			/cannot be used/,
		);
	});

	test("rejects direct private IP urls", async () => {
		const { fetchIcsFromUrl } = await loadModule();
		await expect(fetchIcsFromUrl("https://169.254.169.254/latest")).rejects.toThrow(
			/cannot be used/,
		);
	});

	test("re-validates redirect targets", async () => {
		const { fetchIcsFromUrl } = await loadModule();
		const original = globalThis.fetch;
		globalThis.fetch = mock(
			async () =>
				new Response(null, {
					status: 302,
					headers: { location: "http://internal/cal.ics" },
				}),
		) as unknown as typeof fetch;
		try {
			await expect(fetchIcsFromUrl("https://example.com/cal.ics")).rejects.toThrow();
		} finally {
			globalThis.fetch = original;
		}
	});

	test("caps oversized bodies", async () => {
		const { fetchIcsFromUrl } = await loadModule();
		const original = globalThis.fetch;
		const big = new Uint8Array(6 * 1024 * 1024);
		globalThis.fetch = mock(async () => new Response(big)) as unknown as typeof fetch;
		try {
			await expect(fetchIcsFromUrl("https://example.com/cal.ics")).rejects.toThrow(
				/too large/,
			);
		} finally {
			globalThis.fetch = original;
		}
	});
});
