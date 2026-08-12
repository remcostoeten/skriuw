import { beforeEach, describe, expect, mock, test } from "bun:test";

type MockFn = ReturnType<typeof mock>;

let analyticsDisabled: boolean;
let brave: boolean;
let ingestUrl: string | undefined;
let userScopeId: string;
let preferenceEnabled: boolean;
let trackEvent: MockFn;

beforeEach(() => {
	analyticsDisabled = false;
	brave = false;
	ingestUrl = "https://example.com/ingest";
	userScopeId = "signed-out-local";
	preferenceEnabled = false;
	trackEvent = mock(() => undefined);

	mock.module("@remcostoeten/analytics", () => ({ trackEvent }));
	mock.module("@/core/analytics/config", () => ({
		isClientAnalyticsDisabled: () => analyticsDisabled,
		resolveClientIngestUrl: () => ingestUrl,
		SKRIUW_PROJECT_ID: "skriuw",
		isBraveBrowser: () => brave,
	}));
	mock.module("@/core/auth", () => ({
		getUserScopeId: () => userScopeId,
		SIGNED_OUT_USER_SCOPE: "signed-out-local",
	}));
	mock.module("@/features/settings/store", () => ({
		usePreferencesStore: {
			getState: () => ({ privacy: { analyticsEnabled: preferenceEnabled } }),
		},
	}));
});

async function loadClient() {
	return import(`@/core/analytics/client?test=${Math.random().toString(36).slice(2)}`);
}

describe("analytics consent", () => {
	test("requires stored consent only for authenticated visitors", async () => {
		const { resolveAnalyticsConsent } = await loadClient();
		expect(resolveAnalyticsConsent("signed_out", false)).toEqual({
			consentRequired: false,
			consentGranted: true,
		});
		expect(resolveAnalyticsConsent("initializing", false)).toEqual({
			consentRequired: false,
			consentGranted: true,
		});
		expect(resolveAnalyticsConsent("authenticated", false)).toEqual({
			consentRequired: true,
			consentGranted: false,
		});
		expect(resolveAnalyticsConsent("authenticated", true)).toEqual({
			consentRequired: true,
			consentGranted: true,
		});
	});

	test("allows guests and opted-in users", async () => {
		const { hasProductAnalyticsConsent, isGuestVisitor } = await loadClient();
		expect(isGuestVisitor()).toBe(true);
		expect(hasProductAnalyticsConsent()).toBe(true);

		userScopeId = "user-1";
		preferenceEnabled = true;
		expect(isGuestVisitor()).toBe(false);
		expect(hasProductAnalyticsConsent()).toBe(true);
	});

	test("blocks disabled analytics, Brave, and opted-out authenticated users", async () => {
		const { hasProductAnalyticsConsent, trackProductEvent } = await loadClient();
		analyticsDisabled = true;
		expect(hasProductAnalyticsConsent()).toBe(false);
		trackProductEvent("blocked-disabled");

		analyticsDisabled = false;
		brave = true;
		expect(hasProductAnalyticsConsent()).toBe(false);
		trackProductEvent("blocked-brave");

		brave = false;
		userScopeId = "user-1";
		preferenceEnabled = false;
		expect(hasProductAnalyticsConsent()).toBe(false);
		trackProductEvent("blocked-consent");
		expect(trackEvent).not.toHaveBeenCalled();
	});

	test("dispatches an allowed event with project configuration and metadata", async () => {
		const { trackProductEvent } = await loadClient();
		trackProductEvent("note_created", { source: "toolbar", count: 1 });
		expect(trackEvent).toHaveBeenCalledWith(
			"note_created",
			{ source: "toolbar", count: 1 },
			{
				projectId: "skriuw",
				ingestUrl: "https://example.com/ingest",
				debug: process.env.NODE_ENV !== "production",
			},
		);
	});

	test("does not dispatch when the ingest URL disappears after consent resolution", async () => {
		const { trackProductEvent } = await loadClient();
		ingestUrl = undefined;
		trackProductEvent("missing-url");
		expect(trackEvent).not.toHaveBeenCalled();
	});
});
