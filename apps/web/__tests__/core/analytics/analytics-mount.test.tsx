import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualReact from "react";
import type { AuthSnapshot } from "@/core/auth";

type MockFn = ReturnType<typeof mock>;

let pathname: string;
let auth: AuthSnapshot;
let isHydrated: boolean;
let analyticsEnabled: boolean;
let firstPartyDisabled: boolean;
let posthogDisabled: boolean;
let ingestUrl: string | undefined;
let initialize: MockFn;
let optIn: MockFn;
let optOut: MockFn;
let initPostHog: MockFn;
let syncPostHogConsent: MockFn;
let identifyPostHogPerson: MockFn;
let effectCleanups: Array<() => void>;

const user = {
	id: "user-1",
	email: "one@example.com",
	name: "One",
	role: null,
	username: null,
	avatarColor: null,
};

beforeEach(() => {
	pathname = "/app";
	auth = {
		phase: "signed_out",
		rememberMe: true,
		isReady: true,
		user: null,
		error: null,
	};
	isHydrated = true;
	analyticsEnabled = false;
	firstPartyDisabled = false;
	posthogDisabled = false;
	ingestUrl = "https://example.com/ingest";
	initialize = mock(() => undefined);
	optIn = mock(() => undefined);
	optOut = mock(() => undefined);
	initPostHog = mock(async () => undefined);
	syncPostHogConsent = mock(() => undefined);
	identifyPostHogPerson = mock(() => undefined);
	effectCleanups = [];

	const useEffect = (callback: () => void | (() => void)) => {
		const cleanup = callback();
		if (cleanup) effectCleanups.push(cleanup);
	};
	const reactMock = { ...actualReact, useEffect };
	mock.module("react", () => ({ ...reactMock, default: reactMock }));
	mock.module("next/navigation", () => ({ usePathname: () => pathname }));
	mock.module("@/core/auth/use-auth", () => ({ useAuth: () => auth }));
	mock.module("@/features/settings/store", () => ({
		usePreferencesStore: (
			selector: (value: {
				initialize: MockFn;
				isHydrated: boolean;
				privacy: { analyticsEnabled: boolean };
			}) => unknown,
		) => selector({ initialize, isHydrated, privacy: { analyticsEnabled } }),
	}));
	mock.module("@remcostoeten/analytics", () => ({
		Analytics: () => null,
		optIn,
		optOut,
		trackEvent: mock(() => undefined),
	}));
	mock.module("@/core/analytics/config", () => ({
		isBraveBrowser: () => false,
		isClientAnalyticsDisabled: () => firstPartyDisabled,
		isPostHogDisabled: () => posthogDisabled,
		resolveClientIngestUrl: () => ingestUrl,
		SKRIUW_PROJECT_ID: "skriuw",
	}));
	mock.module("@/core/analytics/posthog", () => ({
		identifyPostHogPerson,
		initPostHog,
		resetPostHogPerson: mock(() => undefined),
		syncPostHogConsent,
	}));
});

async function renderMount() {
	const { AnalyticsMount } = await import(
		`@/core/analytics/analytics-mount?test=${Math.random().toString(36).slice(2)}`
	);
	const rendered = AnalyticsMount();
	await Promise.resolve();
	await Promise.resolve();
	return rendered;
}

describe("AnalyticsMount", () => {
	test("opts guests in and initializes both telemetry backends anonymously", async () => {
		const rendered = await renderMount();
		expect(initialize).toHaveBeenCalledTimes(1);
		expect(optIn).toHaveBeenCalledTimes(1);
		expect(optOut).not.toHaveBeenCalled();
		expect(initPostHog).toHaveBeenCalledTimes(1);
		expect(syncPostHogConsent).toHaveBeenCalledWith(true);
		expect(identifyPostHogPerson).not.toHaveBeenCalled();
		expect(rendered).not.toBeNull();
		expect((rendered as { props: Record<string, unknown> }).props).toMatchObject({
			projectId: "skriuw",
			ingestUrl: "https://example.com/ingest",
			consentRequired: false,
			consentGranted: true,
			trackErrors: true,
		});
	});

	test("waits for authenticated preferences before making a consent decision", async () => {
		auth = { ...auth, phase: "authenticated", user };
		isHydrated = false;
		const rendered = await renderMount();
		expect(optIn).not.toHaveBeenCalled();
		expect(optOut).not.toHaveBeenCalled();
		expect(initPostHog).not.toHaveBeenCalled();
		expect(rendered).toBeNull();
	});

	test("keeps an opted-out authenticated user anonymous across both backends", async () => {
		auth = { ...auth, phase: "authenticated", user };
		analyticsEnabled = false;
		const rendered = await renderMount();
		expect(optOut).toHaveBeenCalledTimes(1);
		expect(syncPostHogConsent).toHaveBeenCalledWith(false);
		expect(identifyPostHogPerson).not.toHaveBeenCalled();
		expect((rendered as { props: Record<string, unknown> }).props).toMatchObject({
			consentRequired: true,
			consentGranted: false,
			trackErrors: false,
		});
	});

	test("identifies an opted-in authenticated user only after PostHog initializes", async () => {
		auth = { ...auth, phase: "authenticated", user };
		analyticsEnabled = true;
		let finishInitialization: (() => void) | undefined;
		initPostHog.mockImplementation(
			() => new Promise<void>((resolve) => (finishInitialization = resolve)),
		);

		const { AnalyticsMount } = await import(
			`@/core/analytics/analytics-mount?test=${Math.random().toString(36).slice(2)}`
		);
		AnalyticsMount();
		expect(syncPostHogConsent).not.toHaveBeenCalled();
		expect(identifyPostHogPerson).not.toHaveBeenCalled();

		finishInitialization?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(optIn).toHaveBeenCalledTimes(1);
		expect(syncPostHogConsent).toHaveBeenCalledWith(true);
		expect(identifyPostHogPerson).toHaveBeenCalledWith(user);
	});

	test("cancels stale consent work when auth or consent changes during initialization", async () => {
		auth = { ...auth, phase: "authenticated", user };
		analyticsEnabled = true;
		let finishInitialization: (() => void) | undefined;
		initPostHog.mockImplementation(
			() => new Promise<void>((resolve) => (finishInitialization = resolve)),
		);
		const { AnalyticsMount } = await import(
			`@/core/analytics/analytics-mount?test=${Math.random().toString(36).slice(2)}`
		);
		AnalyticsMount();
		expect(effectCleanups).toHaveLength(1);

		effectCleanups[0]?.();
		finishInitialization?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(syncPostHogConsent).not.toHaveBeenCalled();
		expect(identifyPostHogPerson).not.toHaveBeenCalled();
	});

	test("does not mount or initialize telemetry on public share routes", async () => {
		pathname = "/s/public-note";
		const rendered = await renderMount();
		expect(rendered).toBeNull();
		expect(initPostHog).not.toHaveBeenCalled();
	});

	test("allows either backend to be disabled independently", async () => {
		firstPartyDisabled = true;
		ingestUrl = undefined;
		const rendered = await renderMount();
		expect(rendered).toBeNull();
		expect(initPostHog).toHaveBeenCalledTimes(1);
		expect(syncPostHogConsent).toHaveBeenCalledWith(true);
	});
});
