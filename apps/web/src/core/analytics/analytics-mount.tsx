"use client";

import { Analytics, optIn, optOut } from "@remcostoeten/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { usePreferencesStore } from "@/features/settings/store";
import { resolveAnalyticsConsent } from "./client";
import {
	isClientAnalyticsDisabled,
	resolveClientIngestUrl,
	SKRIUW_PROJECT_ID,
} from "./config";

export function AnalyticsMount() {
	const pathname = usePathname();
	const auth = useAuth();
	const initialize = usePreferencesStore((state) => state.initialize);
	const isHydrated = usePreferencesStore((state) => state.isHydrated);
	const analyticsEnabled = usePreferencesStore((state) => state.privacy.analyticsEnabled);
	const ingestUrl = resolveClientIngestUrl();
	const consent = resolveAnalyticsConsent(auth.phase, analyticsEnabled);

	useEffect(() => {
		initialize();
	}, [initialize]);

	useEffect(() => {
		if (!auth.isReady) {
			return;
		}

		if (auth.phase !== "authenticated") {
			optIn();
			return;
		}

		if (!isHydrated) {
			return;
		}

		if (analyticsEnabled) {
			optIn();
			return;
		}

		optOut();
	}, [analyticsEnabled, auth.isReady, auth.phase, isHydrated]);

	if (
		isClientAnalyticsDisabled() ||
		!ingestUrl ||
		!auth.isReady ||
		pathname?.startsWith("/s/") ||
		(auth.phase === "authenticated" && !isHydrated)
	) {
		return null;
	}

	return (
		<Analytics
			projectId={SKRIUW_PROJECT_ID}
			ingestUrl={ingestUrl}
			consentRequired={consent.consentRequired}
			consentGranted={consent.consentGranted}
			trackErrors={consent.consentGranted}
		/>
	);
}
