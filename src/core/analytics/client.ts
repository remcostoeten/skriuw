"use client";

import { trackEvent } from "@remcostoeten/analytics";
import { usePreferencesStore } from "@/features/settings/store";
import { isClientAnalyticsDisabled, resolveClientIngestUrl, SKRIUW_PROJECT_ID } from "./config";

export function hasProductAnalyticsConsent(): boolean {
	if (isClientAnalyticsDisabled()) return false;
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
