import { beforeEach, describe, expect, mock, test } from "bun:test";

let trackSkriuwServer: ReturnType<typeof mock>;

beforeEach(() => {
	trackSkriuwServer = mock(async () => undefined);
	mock.module("server-only", () => ({}));
	mock.module("better-auth/api", () => ({
		createAuthMiddleware: (handler: (context: unknown) => Promise<void>) => handler,
	}));
	mock.module("@/core/analytics/server-track", () => ({ trackSkriuwServer }));
});

async function loadHook() {
	return import(`@/core/analytics/auth-track?test=${Math.random().toString(36).slice(2)}`);
}

function context(path: string, createdAt?: Date | string, hasSession = true) {
	return {
		path,
		context: {
			newSession: hasSession ? { user: { createdAt } } : null,
		},
	};
}

describe("authAnalyticsHook", () => {
	test("tracks email sign-up and sign-in", async () => {
		const { authAnalyticsHook } = await loadHook();
		await (authAnalyticsHook as unknown as (value: unknown) => Promise<void>)(
			context("/sign-up/email"),
		);
		await (authAnalyticsHook as unknown as (value: unknown) => Promise<void>)(
			context("/sign-in/email"),
		);

		expect(trackSkriuwServer).toHaveBeenNthCalledWith(
			1,
			"auth_signup_completed",
			{ method: "email" },
			"/auth",
		);
		expect(trackSkriuwServer).toHaveBeenNthCalledWith(
			2,
			"auth_signin_completed",
			{ method: "email" },
			"/auth",
		);
	});

	test("classifies supported OAuth callbacks by account age", async () => {
		const { authAnalyticsHook } = await loadHook();
		const run = authAnalyticsHook as unknown as (value: unknown) => Promise<void>;
		await run(context("/callback/github", new Date(Date.now() - 1_000)));
		await run(context("/callback/google", new Date(Date.now() - 60_000)));

		expect(trackSkriuwServer).toHaveBeenNthCalledWith(
			1,
			"auth_signup_completed",
			{ method: "github" },
			"/auth",
		);
		expect(trackSkriuwServer).toHaveBeenNthCalledWith(
			2,
			"auth_signin_completed",
			{ method: "google" },
			"/auth",
		);
	});

	test("ignores missing sessions, unrelated paths, and unsupported providers", async () => {
		const { authAnalyticsHook } = await loadHook();
		const run = authAnalyticsHook as unknown as (value: unknown) => Promise<void>;
		await run(context("/sign-in/email", undefined, false));
		await run(context("/session"));
		await run(context("/callback/twitter", new Date()));
		expect(trackSkriuwServer).not.toHaveBeenCalled();
	});
});
