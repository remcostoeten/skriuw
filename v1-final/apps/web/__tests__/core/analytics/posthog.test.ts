import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualConfig from "@/core/analytics/config";

type PostHogStub = {
	__loaded: boolean;
	init: ReturnType<typeof mock>;
	has_opted_out_capturing: ReturnType<typeof mock>;
	opt_in_capturing: ReturnType<typeof mock>;
	opt_out_capturing: ReturnType<typeof mock>;
	get_distinct_id: ReturnType<typeof mock>;
	identify: ReturnType<typeof mock>;
	reset: ReturnType<typeof mock>;
};

let disabled: boolean;
let optedOut: boolean;
let distinctId: string;
let posthog: PostHogStub;
let originalWindow: PropertyDescriptor | undefined;

beforeEach(() => {
	disabled = false;
	optedOut = true;
	distinctId = "anonymous";
	originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

	posthog = {
		__loaded: false,
		init: mock(() => {
			posthog.__loaded = true;
		}),
		has_opted_out_capturing: mock(() => optedOut),
		opt_in_capturing: mock(() => {
			optedOut = false;
		}),
		opt_out_capturing: mock(() => {
			optedOut = true;
		}),
		get_distinct_id: mock(() => distinctId),
		identify: mock((id: string) => {
			distinctId = id;
		}),
		reset: mock(() => undefined),
	};

	mock.module("posthog-js", () => ({ default: posthog }));
	mock.module("@/core/analytics/config", () => ({
		...actualConfig,
		isPostHogDisabled: () => disabled,
		POSTHOG_PROXY_PATH: "/ph-ingest",
		resolvePostHogKey: () => "ph_test",
		resolvePostHogUiHost: () => "https://eu.posthog.com",
	}));
});

afterEach(() => {
	if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

async function loadPostHog() {
	return import(`@/core/analytics/posthog?test=${Math.random().toString(36).slice(2)}`);
}

describe("PostHog lifecycle", () => {
	test("initializes once, opted out, through the proxy", async () => {
		const { initPostHog } = await loadPostHog();
		await initPostHog();
		await initPostHog();
		expect(posthog.init).toHaveBeenCalledTimes(1);
		expect(posthog.init).toHaveBeenCalledWith("ph_test", {
			api_host: "/ph-ingest",
			ui_host: "https://eu.posthog.com",
			defaults: "2025-05-24",
			person_profiles: "identified_only",
			opt_out_capturing_by_default: true,
		});
	});

	test("does not initialize when disabled or outside the browser", async () => {
		const { initPostHog } = await loadPostHog();
		disabled = true;
		await initPostHog();
		disabled = false;
		Reflect.deleteProperty(globalThis, "window");
		await initPostHog();
		expect(posthog.init).not.toHaveBeenCalled();
	});

	test("changes capture state only when a transition is needed", async () => {
		const { initPostHog, syncPostHogConsent } = await loadPostHog();
		await initPostHog();
		syncPostHogConsent(true);
		syncPostHogConsent(true);
		expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1);

		syncPostHogConsent(false);
		syncPostHogConsent(false);
		expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1);
	});

	test("identifies only opted-in users, avoids duplicate identity, and resets", async () => {
		const { identifyPostHogPerson, initPostHog, resetPostHogPerson, syncPostHogConsent } =
			await loadPostHog();
		const user = { id: "user-1", email: "one@example.com", name: "One" };
		await initPostHog();
		identifyPostHogPerson(user as never);
		expect(posthog.identify).not.toHaveBeenCalled();

		syncPostHogConsent(true);
		identifyPostHogPerson(user as never);
		identifyPostHogPerson(user as never);
		expect(posthog.identify).toHaveBeenCalledTimes(1);
		expect(posthog.identify).toHaveBeenCalledWith("user-1", {
			email: "one@example.com",
			name: "One",
		});

		resetPostHogPerson();
		expect(posthog.reset).toHaveBeenCalledTimes(1);
	});
});
