import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const AUTH_PREFERENCES_KEY = "skriuw:auth:preferences:v1";

type StorageMock = {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
	clear: () => void;
};

function createStorage(): StorageMock {
	const entries = new Map<string, string>();
	return {
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => {
			entries.set(key, value);
		},
		removeItem: (key) => {
			entries.delete(key);
		},
		clear: () => {
			entries.clear();
		},
	};
}

function installWindow(href = "http://localhost:3000/") {
	const localStorage = createStorage();
	const sessionStorage = createStorage();
	const url = new URL(href);

	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			localStorage,
			sessionStorage,
			location: {
				href,
				origin: url.origin,
				pathname: url.pathname,
				search: url.search,
			},
		},
	});

	return { localStorage, sessionStorage };
}

function registerAuthClientMock() {
	mock.module("@/lib/auth-client", () => ({
		authClient: {
			getSession: async () => ({ data: null, error: null }),
			signIn: {
				email: async () => ({ data: null, error: null }),
				social: async () => ({ data: null, error: null }),
			},
			signUp: {
				email: async () => ({ data: null, error: null }),
			},
			signOut: async () => ({ data: null, error: null }),
			updateUser: async () => ({ data: null, error: null }),
			changePassword: async () => ({ data: null, error: null }),
		},
	}));
}

describe("auth session state", () => {
	beforeEach(() => {
		installWindow();
		registerAuthClientMock();
	});

	afterEach(() => {
		mock.restore();
		Reflect.deleteProperty(globalThis, "window");
	});

	test("reads remember-me preference without loading a client session", async () => {
		const { localStorage } = installWindow();
		localStorage.setItem(AUTH_PREFERENCES_KEY, JSON.stringify({ rememberMe: false }));

		const authModule = await import(
			`@/core/auth/index?remember-me=${Math.random().toString(36).slice(2)}`
		);

		expect(authModule.getRememberMePreference()).toBe(false);
		expect(authModule.getUserScopeId()).toBe("signed-out-local");
	});

	test("signing out returns the auth state to signed out", async () => {
		const authModule = await import(
			`@/core/auth/index?sign-out=${Math.random().toString(36).slice(2)}`
		);

		authModule.resetAuthForTests();
		const snapshot = await authModule.signOut();

		expect(snapshot).toEqual(
			expect.objectContaining({
				phase: "signed_out",
				user: null,
			}),
		);
	});

	test("builds a stable OAuth callback redirect", async () => {
		installWindow("http://localhost:3000/sign-in?draft=1");
		const authModule = await import(
			`@/core/auth/index?oauth-redirect-auth-page=${Math.random().toString(36).slice(2)}`
		);

		expect(authModule.getOAuthRedirectTo()).toBe("http://localhost:3000/app");
	});

	test("preserves app paths as the OAuth callback next target", async () => {
		installWindow("https://skriuw.example/app/journal?entry=42");
		const authModule = await import(
			`@/core/auth/index?oauth-redirect-app-page=${Math.random().toString(36).slice(2)}`
		);

		expect(authModule.getOAuthRedirectTo()).toBe(
			"https://skriuw.example/app/journal?entry=42",
		);
	});
});
