import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	isAllTelemetryDisabled,
	isBraveBrowser,
	isClientAnalyticsDisabled,
	isLocalhost,
	isPostHogDisabled,
	isServerAnalyticsConfigured,
	resolveClientIngestUrl,
	resolveIngestSecret,
	resolvePostHogKey,
	resolvePostHogUiHost,
	resolveServerIngestUrl,
} from "@/core/analytics/config";

const ENV_KEYS = [
	"ANALYTICS_URL",
	"INGEST_SECRET",
	"NEXT_PUBLIC_ANALYTICS_ENABLED",
	"NEXT_PUBLIC_ANALYTICS_URL",
	"NEXT_PUBLIC_POSTHOG_KEY",
	"NEXT_PUBLIC_POSTHOG_UI_HOST",
] as const;

let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
	originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
	for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = originalEnv[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("analytics configuration", () => {
	test("normalizes client configuration and requires an explicit enabled flag", () => {
		expect(resolveClientIngestUrl()).toBeUndefined();
		expect(isClientAnalyticsDisabled()).toBe(true);

		process.env.NEXT_PUBLIC_ANALYTICS_URL = "  https://ingest.example/client  ";
		expect(resolveClientIngestUrl()).toBe("https://ingest.example/client");
		expect(isClientAnalyticsDisabled()).toBe(true);

		process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = "true";
		expect(isClientAnalyticsDisabled()).toBe(false);
	});

	test("prefers the server URL, falls back to the client URL, and requires a secret", () => {
		process.env.NEXT_PUBLIC_ANALYTICS_URL = "https://ingest.example/client";
		expect(resolveServerIngestUrl()).toBe("https://ingest.example/client");
		expect(isServerAnalyticsConfigured()).toBe(false);

		process.env.ANALYTICS_URL = "  https://ingest.example/server ";
		process.env.INGEST_SECRET = "  test-secret ";
		expect(resolveServerIngestUrl()).toBe("https://ingest.example/server");
		expect(resolveIngestSecret()).toBe("test-secret");
		expect(isServerAnalyticsConfigured()).toBe(true);
	});

	test("resolves PostHog defaults independently from first-party analytics", () => {
		expect(resolvePostHogKey()).toBeUndefined();
		expect(resolvePostHogUiHost()).toBe("https://us.posthog.com");
		expect(isPostHogDisabled()).toBe(true);
		expect(isAllTelemetryDisabled()).toBe(true);

		process.env.NEXT_PUBLIC_POSTHOG_KEY = "  ph_test  ";
		process.env.NEXT_PUBLIC_POSTHOG_UI_HOST = "  https://eu.posthog.com  ";
		expect(resolvePostHogKey()).toBe("ph_test");
		expect(resolvePostHogUiHost()).toBe("https://eu.posthog.com");
		expect(isPostHogDisabled()).toBe(false);
		expect(isAllTelemetryDisabled()).toBe(false);
	});

	test("treats localhost hostnames as local and disables PostHog there", () => {
		expect(isLocalhost("localhost")).toBe(true);
		expect(isLocalhost("127.0.0.1")).toBe(true);
		expect(isLocalhost("[::1]")).toBe(true);
		expect(isLocalhost("skriuw.com")).toBe(false);
		expect(isLocalhost("")).toBe(false);

		process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
		const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { hostname: "localhost" } },
		});
		try {
			expect(isPostHogDisabled()).toBe(true);
			expect(isClientAnalyticsDisabled()).toBe(true);
		} finally {
			if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
			else Reflect.deleteProperty(globalThis, "window");
		}
	});

	test("detects Brave from either signal", () => {
		expect(isBraveBrowser("Mozilla/5.0 Brave/1.0", false)).toBe(true);
		expect(isBraveBrowser("Mozilla/5.0 Chrome/126 Safari/537", true)).toBe(true);
		expect(isBraveBrowser("Mozilla/5.0 Chrome/126 Safari/537", false)).toBe(false);
	});
});
