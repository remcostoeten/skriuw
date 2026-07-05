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

		expect(authModule.getOAuthRedirectTo()).toBe("https://skriuw.example/app/journal?entry=42");
	});

	test("signs in with password and stores the mapped user", async () => {
		mock.module("@/lib/auth-client", () => ({
			authClient: {
				signIn: {
					email: async () => ({
						data: { user: { id: "u1", email: "a@b.com", name: "  " } },
						error: null,
					}),
				},
			},
		}));
		const authModule = await import(
			`@/core/auth/index?sign-in-password=${Math.random().toString(36).slice(2)}`
		);

		const snapshot = await authModule.signInWithPassword({
			email: "a@b.com",
			password: "secret",
			rememberMe: true,
		});

		expect(snapshot.phase).toBe("authenticated");
		expect(snapshot.user).toEqual(expect.objectContaining({ id: "u1", name: "a" }));
	});

	test("throws on sign-in error with the server message", async () => {
		mock.module("@/lib/auth-client", () => ({
			authClient: {
				signIn: {
					email: async () => ({ data: null, error: { message: "Invalid credentials" } }),
				},
			},
		}));
		const authModule = await import(
			`@/core/auth/index?sign-in-error=${Math.random().toString(36).slice(2)}`
		);

		await expect(
			authModule.signInWithPassword({ email: "a@b.com", password: "x", rememberMe: false }),
		).rejects.toThrow("Invalid credentials");
	});

	test("sign-up clears guest storage and returns an authenticated snapshot", async () => {
		let guestReset = false;
		mock.module("@/core/workspace-backend/local-backend", () => ({
			resetGuestStorage: async () => {
				guestReset = true;
			},
		}));
		mock.module("@/lib/auth-client", () => ({
			authClient: {
				signUp: {
					email: async () => ({
						data: { user: { id: "u2", email: "new@b.com" } },
						error: null,
					}),
				},
			},
		}));
		const authModule = await import(
			`@/core/auth/index?sign-up=${Math.random().toString(36).slice(2)}`
		);

		const snapshot = await authModule.signUpWithPassword({
			email: "new@b.com",
			password: "secret",
			rememberMe: true,
		});

		expect(guestReset).toBe(true);
		expect(snapshot.user).toEqual(expect.objectContaining({ id: "u2", name: "new" }));
	});

	test("sign-up throws when no session is returned", async () => {
		mock.module("@/core/workspace-backend/local-backend", () => ({
			resetGuestStorage: async () => {},
		}));
		mock.module("@/lib/auth-client", () => ({
			authClient: {
				signUp: {
					email: async () => ({ data: null, error: null }),
				},
			},
		}));
		const authModule = await import(
			`@/core/auth/index?sign-up-no-session=${Math.random().toString(36).slice(2)}`
		);

		await expect(
			authModule.signUpWithPassword({ email: "new@b.com", password: "x", rememberMe: false }),
		).rejects.toThrow("Account created but no session returned.");
	});

	test("update helpers surface server error messages", async () => {
		mock.module("@/lib/auth-client", () => ({
			authClient: {
				updateUser: async () => ({ data: null, error: { message: "nope" } }),
				changePassword: async () => ({ data: null, error: { message: "bad password" } }),
			},
		}));
		const authModule = await import(
			`@/core/auth/index?update-errors=${Math.random().toString(36).slice(2)}`
		);

		await expect(authModule.updateUserDisplayName("Name")).rejects.toThrow("nope");
		await expect(
			authModule.updatePassword({ currentPassword: "a", newPassword: "b" }),
		).rejects.toThrow("bad password");
	});

	test("updateUsername attaches the error code for taken usernames", async () => {
		mock.module("@/lib/auth-client", () => ({
			authClient: {
				updateUser: async () => ({
					data: null,
					error: { message: "taken", code: "USERNAME_IS_ALREADY_TAKEN" },
				}),
			},
		}));
		const authModule = await import(
			`@/core/auth/index?update-username=${Math.random().toString(36).slice(2)}`
		);

		try {
			await authModule.updateUsername("bob");
			throw new Error("expected updateUsername to throw");
		} catch (error) {
			expect(authModule.isUsernameTakenError(error)).toBe(true);
		}

		expect(authModule.isUsernameTakenError(new Error("other"))).toBe(false);
		expect(authModule.isUsernameTakenError(null)).toBe(false);
	});

	test("resolveUserScopeId prefers the explicit scope over the current user", async () => {
		const authModule = await import(
			`@/core/auth/index?resolve-scope=${Math.random().toString(36).slice(2)}`
		);

		expect(authModule.resolveUserScopeId("explicit-scope")).toBe("explicit-scope");
		expect(authModule.resolveUserScopeId(null)).toBe("signed-out-local");
		expect(authModule.getUserScopeIdForUser(null)).toBe("signed-out-local");
		expect(
			authModule.getUserScopeIdForUser({
				id: "abc",
				email: "",
				name: "",
				role: null,
				username: null,
				avatarColor: null,
			}),
		).toBe("abc");
	});

	test("createAuthSnapshot maps pending/error/user states", async () => {
		const authModule = await import(
			`@/core/auth/index?create-snapshot=${Math.random().toString(36).slice(2)}`
		);

		expect(authModule.createAuthSnapshot({ user: null, isPending: true }).phase).toBe(
			"initializing",
		);
		expect(authModule.createAuthSnapshot({ user: null, error: new Error("boom") }).error).toBe(
			"boom",
		);
		expect(authModule.createAuthSnapshot({ user: null, error: "plain" }).error).toBe("plain");
	});
});
