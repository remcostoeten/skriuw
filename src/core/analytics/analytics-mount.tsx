"use client";

import { Analytics } from "@remcostoeten/analytics";
import { useEffect } from "react";
import { usePreferencesStore } from "@/features/settings/store";
import {
	isClientAnalyticsDisabled,
	resolveClientIngestUrl,
	SKRIUW_PROJECT_ID,
} from "./config";

export function AnalyticsMount() {
	const initialize = usePreferencesStore((state) => state.initialize);
	const isHydrated = usePreferencesStore((state) => state.isHydrated);
	const analyticsEnabled = usePreferencesStore((state) => state.privacy.analyticsEnabled);
	const ingestUrl = resolveClientIngestUrl();

	useEffect(() => {
		initialize();
	}, [initialize]);

	if (isClientAnalyticsDisabled() || !ingestUrl || !isHydrated) {
		return null;
	}

	return (
		<Analytics
			projectId={SKRIUW_PROJECT_ID}
			ingestUrl={ingestUrl}
			consentRequired
			consentGranted={analyticsEnabled}
			trackErrors={analyticsEnabled}
		/>
	);
}
