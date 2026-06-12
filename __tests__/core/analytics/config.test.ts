import { describe, expect, test } from "bun:test";
import {
	isServerAnalyticsConfigured,
	resolveIngestSecret,
	resolveServerIngestUrl,
} from "@/core/analytics/config";

describe("server analytics config", () => {
	test("requires both ingest url and secret", () => {
		const originalUrl = process.env.ANALYTICS_URL;
		const originalSecret = process.env.INGEST_SECRET;

		process.env.ANALYTICS_URL = "https://ingestion.example.com";
		delete process.env.INGEST_SECRET;
		expect(isServerAnalyticsConfigured()).toBe(false);

		process.env.INGEST_SECRET = "test-secret";
		expect(isServerAnalyticsConfigured()).toBe(true);
		expect(resolveServerIngestUrl()).toBe("https://ingestion.example.com");
		expect(resolveIngestSecret()).toBe("test-secret");

		if (originalUrl === undefined) delete process.env.ANALYTICS_URL;
		else process.env.ANALYTICS_URL = originalUrl;
		if (originalSecret === undefined) delete process.env.INGEST_SECRET;
		else process.env.INGEST_SECRET = originalSecret;
	});
});
