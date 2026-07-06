import { describe, expect, mock, test } from "bun:test";

mock.module("@/core/analytics/config", () => ({
	isClientAnalyticsDisabled: () => false,
	resolveClientIngestUrl: () => "https://example.com/ingest",
	SKRIUW_PROJECT_ID: "skriuw",
	isBraveBrowser: () => false,
}));

mock.module("@/core/auth", () => ({
	getUserScopeId: () => "signed-out-local",
	resolveUserScopeId: (userScopeId?: string | null) => userScopeId ?? "signed-out-local",
	SIGNED_OUT_USER_SCOPE: "signed-out-local",
}));

mock.module("@/features/settings/store", () => ({
	usePreferencesStore: {
		getState: () => ({ privacy: { analyticsEnabled: false } }),
	},
}));

const { hasProductAnalyticsConsent, isGuestVisitor, resolveAnalyticsConsent } =
	await import("@/core/analytics/client");

mock.restore();

describe("analytics consent", () => {
	test("tracks demo visitors without requiring account consent", () => {
		expect(resolveAnalyticsConsent("signed_out", false)).toEqual({
			consentRequired: false,
			consentGranted: true,
		});
	});

	test("requires account consent after sign-in", () => {
		expect(resolveAnalyticsConsent("authenticated", false)).toEqual({
			consentRequired: true,
			consentGranted: false,
		});

		expect(resolveAnalyticsConsent("authenticated", true)).toEqual({
			consentRequired: true,
			consentGranted: true,
		});
	});

	test("treats signed-out scope as a guest visitor", () => {
		expect(isGuestVisitor()).toBe(true);
		expect(hasProductAnalyticsConsent()).toBe(true);
	});
});
