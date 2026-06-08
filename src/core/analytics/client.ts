"use client";

import { trackEvent } from "@remcostoeten/analytics";
import { getUserScopeId, SIGNED_OUT_USER_SCOPE, type AuthPhase } from "@/core/auth";
import { usePreferencesStore } from "@/features/settings/store";
import { isClientAnalyticsDisabled, resolveClientIngestUrl, SKRIUW_PROJECT_ID } from "./config";

export type AnalyticsConsent = {
	consentRequired: boolean;
	consentGranted: boolean;
};

export function isGuestVisitor(): boolean {
	return getUserScopeId() === SIGNED_OUT_USER_SCOPE;
}

export function resolveAnalyticsConsent(
	phase: AuthPhase,
	analyticsEnabled: boolean,
): AnalyticsConsent {
	if (phase === "authenticated") {
		return {
			consentRequired: true,
			consentGranted: analyticsEnabled,
		};
	}

	return {
		consentRequired: false,
		consentGranted: true,
	};
}

export function hasProductAnalyticsConsent(): boolean {
	if (isClientAnalyticsDisabled()) return false;
	if (isGuestVisitor()) return true;
	return usePreferencesStore.getState().privacy.analyticsEnabled;
}

export function trackProductEvent(
	name: string,
	meta?: Record<string, string | number | boolean>,
): void {
	if (!hasProductAnalyticsConsent()) return;

	const ingestUrl = resolveClientIngestUrl();
	if (!ingestUrl) return;

	trackEvent(name, meta, {
		projectId: SKRIUW_PROJECT_ID,
		ingestUrl,
		debug: process.env.NODE_ENV !== "production",
	});
}
