import { afterEach, describe, expect, test } from "bun:test";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			delete process.env[key];
		}
	}

	Object.assign(process.env, ORIGINAL_ENV);
}

async function importAppOrigin() {
	return import(`@/lib/app-origin?test=${Math.random().toString(36).slice(2)}`);
}

describe("app origin helpers", () => {
	afterEach(() => {
		restoreEnv();
		Reflect.deleteProperty(globalThis, "window");
	});

	test("normalizes Vercel host env vars into origins", async () => {
		process.env.BETTER_AUTH_URL = "";
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "";
		process.env.VERCEL_PROJECT_PRODUCTION_URL = "skriuw.com";
		process.env.VERCEL_URL = "skriuw-git-main-remco.vercel.app";

		const { getConfiguredAppOrigins } = await importAppOrigin();

		expect(getConfiguredAppOrigins()).toEqual([
			"https://skriuw.com",
			"https://skriuw-git-main-remco.vercel.app",
		]);
	});

	test("uses the browser origin for client callbacks", async () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					origin: "https://skriuw.app",
				},
			},
		});

		const { getBrowserAppOrigin } = await importAppOrigin();

		expect(getBrowserAppOrigin()).toBe("https://skriuw.app");
	});

	test("allows known production hosts when explicit auth envs are blank", async () => {
		Object.defineProperty(process.env, "NODE_ENV", {
			configurable: true,
			value: "production",
			writable: true,
		});
		process.env.BETTER_AUTH_URL = "";
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "";
		process.env.VERCEL_PROJECT_PRODUCTION_URL = "";
		process.env.VERCEL_URL = "";

		const { getBetterAuthBaseURL } = await importAppOrigin();

		expect(getBetterAuthBaseURL()).toEqual(
			expect.objectContaining({
				fallback: "https://skriuw.com",
				allowedHosts: expect.arrayContaining(["skriuw.com", "skriuw.app", "*.vercel.app"]),
			}),
		);
	});
});
