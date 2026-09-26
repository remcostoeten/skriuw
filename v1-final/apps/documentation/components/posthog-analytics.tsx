"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

/**
 * Anonymous-only PostHog for the docs site. There is no auth here, so nothing
 * ever calls `identify()` — with `person_profiles: 'identified_only'` that means
 * no person profiles are created for docs traffic.
 *
 * @see https://posthog.com/docs/data/persons#capturing-person-profiles
 */
export function PostHogAnalytics() {
	useEffect(() => {
		const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
		if (!key || posthog.__loaded) return;

		const { hostname } = window.location;
		if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return;

		posthog.init(key, {
			api_host: "/ph-ingest",
			ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST?.trim() || "https://us.posthog.com",
			defaults: "2025-05-24",
			person_profiles: "identified_only",
		});
	}, []);

	return null;
}
