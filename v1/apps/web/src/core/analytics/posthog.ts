"use client";

import type PostHogJS from "posthog-js";
import type { AuthUser } from "@/core/auth/auth-user";
import {
	isPostHogDisabled,
	POSTHOG_PROXY_PATH,
	resolvePostHogKey,
	resolvePostHogUiHost,
} from "./config";

// Loaded dynamically so the SDK's browser-only module-init code never runs
// during SSR or in the (non-DOM) test runner.
let posthog: typeof PostHogJS | null = null;

function getLoaded(): typeof PostHogJS | null {
	if (typeof window === "undefined" || posthog?.__loaded !== true) return null;
	return posthog;
}

/**
 * Boots posthog-js opted out of capturing. Consent is applied separately by
 * {@link syncPostHogConsent}, so nothing is sent between init and the moment
 * the auth phase and stored privacy preference have both resolved.
 *
 * Person profiles are `identified_only`: guests stay anonymous and a profile is
 * only created once {@link identifyPostHogPerson} runs.
 *
 * @see https://posthog.com/docs/data/persons#capturing-person-profiles
 */
export async function initPostHog(): Promise<void> {
	if (typeof window === "undefined" || isPostHogDisabled() || getLoaded()) return;

	const key = resolvePostHogKey();
	if (!key) return;

	const { default: posthogJs } = await import("posthog-js");
	posthog = posthogJs;

	posthog.init(key, {
		api_host: POSTHOG_PROXY_PATH,
		ui_host: resolvePostHogUiHost(),
		defaults: "2025-05-24",
		person_profiles: "identified_only",
		opt_out_capturing_by_default: true,
	});
}

/** Mirrors the resolved analytics consent onto PostHog's capture switch. */
export function syncPostHogConsent(granted: boolean): void {
	const loaded = getLoaded();
	if (!loaded) return;

	if (granted) {
		if (loaded.has_opted_out_capturing()) {
			loaded.opt_in_capturing();
		}
		return;
	}

	if (!loaded.has_opted_out_capturing()) {
		loaded.opt_out_capturing();
	}
}

/**
 * Creates or updates the person profile for a signed-in user. No-ops without
 * consent, so an authenticated user who disabled analytics never gets a
 * profile. Repeat calls with the same id are cheap.
 */
export function identifyPostHogPerson(user: AuthUser): void {
	const loaded = getLoaded();
	if (!loaded || loaded.has_opted_out_capturing()) return;
	if (loaded.get_distinct_id() === user.id) return;

	loaded.identify(user.id, {
		email: user.email,
		name: user.name,
	});
}

/**
 * Drops the identified person and issues a fresh anonymous id. Required on
 * sign-out, otherwise the next person to use this browser is merged into the
 * previous user's profile.
 */
export function resetPostHogPerson(): void {
	getLoaded()?.reset();
}
