import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

let configured: boolean;
let trackServerEvent: ReturnType<typeof mock>;

beforeEach(() => {
	configured = true;
	trackServerEvent = mock(async () => undefined);
	mock.module("server-only", () => ({}));
	mock.module("@remcostoeten/analytics/server", () => ({ trackServerEvent }));
	mock.module("@/core/analytics/config", () => ({
		isServerAnalyticsConfigured: () => configured,
		resolveIngestSecret: () => "secret",
		resolveServerIngestUrl: () => "https://example.com/ingest",
		SKRIUW_PROJECT_ID: "skriuw",
	}));
});

async function loadServerTracker() {
	return import(`@/core/analytics/server-track?test=${Math.random().toString(36).slice(2)}`);
}

describe("trackSkriuwServer", () => {
	test("does nothing when server analytics is not configured", async () => {
		configured = false;
		const { trackSkriuwServer } = await loadServerTracker();
		await trackSkriuwServer("ignored");
		expect(trackServerEvent).not.toHaveBeenCalled();
	});

	test("dispatches events with and without metadata", async () => {
		const { trackSkriuwServer } = await loadServerTracker();
		const options = {
			projectId: "skriuw",
			path: "/auth",
			ingestUrl: "https://example.com/ingest",
			secret: "secret",
		};

		await trackSkriuwServer("auth_signin_completed", { method: "email" }, "/auth");
		expect(trackServerEvent).toHaveBeenCalledWith(
			"auth_signin_completed",
			{ method: "email" },
			options,
		);

		await trackSkriuwServer("heartbeat", undefined, "/auth");
		expect(trackServerEvent).toHaveBeenLastCalledWith("heartbeat", options);
	});

	test("swallows provider failures so analytics cannot break the request", async () => {
		trackServerEvent.mockImplementation(async () => {
			throw new Error("offline");
		});
		const error = spyOn(console, "error").mockImplementation(() => undefined);
		const { trackSkriuwServer } = await loadServerTracker();

		await expect(trackSkriuwServer("safe_failure")).resolves.toBeUndefined();
		if (process.env.NODE_ENV !== "production") {
			expect(error).toHaveBeenCalled();
		}
		error.mockRestore();
	});
});
