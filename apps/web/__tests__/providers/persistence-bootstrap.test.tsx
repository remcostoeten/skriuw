import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualReact from "react";
import type { AuthSnapshot } from "@/core/auth";

type EffectRecord = {
	deps: unknown[] | undefined;
	cleanup?: void | (() => void);
};

type MockFn = (...args: any[]) => any;
const createMock = mock as unknown as (implementation: MockFn) => MockFn;

let authSnapshot: AuthSnapshot;
let resetNotesUi: MockFn;
let initializeNotes: MockFn;
let syncPreferencesActor: MockFn;
let syncSidebarActor: MockFn;
let renderedEffects: EffectRecord[][] = [];
let currentRenderEffects: EffectRecord[] = [];
let effectCursor = 0;

function depsChanged(previous: unknown[] | undefined, next: unknown[] | undefined) {
	if (!previous || !next) {
		return true;
	}

	if (previous.length !== next.length) {
		return true;
	}

	return next.some((dependency, index) => !Object.is(dependency, previous[index]));
}

function renderComponent(Component: () => null) {
	effectCursor = 0;
	currentRenderEffects = [];
	const result = Component();
	renderedEffects.push(currentRenderEffects);
	return result;
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

function registerModuleMocks() {
	// Spread the real react module so this mock stays a complete module (with a
	// `default` export and every other hook) even if bun leaks it into another
	// isolated test file; only `useEffect` is swapped for a synchronous,
	// deps-aware stub so the bootstrap component runs as a plain function call.
	const useEffectStub = (callback: () => void | (() => void), deps?: unknown[]) => {
		const index = effectCursor++;
		const previousRender = renderedEffects.at(-1);
		const previousEffect = previousRender?.[index];

		if (!previousEffect || depsChanged(previousEffect.deps, deps)) {
			previousEffect?.cleanup?.();
			const cleanup = callback();
			currentRenderEffects[index] = { deps, cleanup };
			return;
		}

		currentRenderEffects[index] = previousEffect;
	};
	const reactMock = { ...actualReact, useEffect: useEffectStub };
	mock.module("react", () => ({ ...reactMock, default: reactMock }));

	mock.module("@/core/auth/use-auth", () => ({
		useAuth: () => authSnapshot,
	}));

	mock.module("@/features/notes/store", () => ({
		useNotesStore: {
			getState: () => ({
				resetUi: resetNotesUi,
				initialize: initializeNotes,
			}),
		},
	}));

	mock.module("@/features/settings/store", () => ({
		usePreferencesStore: {
			getState: () => ({
				syncUserScope: syncPreferencesActor,
			}),
		},
	}));

	mock.module("@/features/notes/components/sidebar/store", () => ({
		useSidebarStore: {
			getState: () => ({
				syncUserScope: syncSidebarActor,
			}),
		},
	}));
}

beforeEach(() => {
	authSnapshot = {
		phase: "authenticated",
		rememberMe: true,
		isReady: true,
		user: {
			id: "user-a",
			email: "user-a@example.com",
			name: "User A",
			role: null,
		},
		error: null,
	};

	resetNotesUi = createMock(() => undefined);
	initializeNotes = createMock(async () => undefined);
	syncPreferencesActor = createMock(() => undefined);
	syncSidebarActor = createMock(async () => undefined);
	renderedEffects = [];
	currentRenderEffects = [];
	effectCursor = 0;
});

afterEach(() => {
	mock.restore();
});

describe("PersistenceBootstrap", () => {
	test("re-initializes persisted state when the authenticated user changes", async () => {
		registerModuleMocks();

		const { PersistenceBootstrap } = await import(
			`@/providers/persistence-bootstrap?user-switch=${Math.random().toString(36).slice(2)}`
		);

		renderComponent(PersistenceBootstrap);
		await flushMicrotasks();

		expect(resetNotesUi).toHaveBeenCalledTimes(1);
		expect(initializeNotes).toHaveBeenCalledTimes(1);
		expect(resetNotesUi).toHaveBeenCalledTimes(1);
		expect(initializeNotes).toHaveBeenCalledWith();
		expect(syncPreferencesActor).toHaveBeenCalledWith("user-a");
		expect(syncSidebarActor).toHaveBeenCalledWith("user-a");

		authSnapshot = {
			...authSnapshot,
			user: {
				id: "user-b",
				email: "user-b@example.com",
				name: "User B",
				role: null,
			},
		};

		renderComponent(PersistenceBootstrap);
		await flushMicrotasks();

		expect(renderedEffects).toHaveLength(2);
		expect(resetNotesUi).toHaveBeenCalledTimes(2);
		expect(initializeNotes).toHaveBeenCalledTimes(2);
		expect(resetNotesUi).toHaveBeenLastCalledWith();
		expect(initializeNotes).toHaveBeenLastCalledWith();
		expect(syncPreferencesActor).toHaveBeenLastCalledWith("user-b");
		expect(syncSidebarActor).toHaveBeenLastCalledWith("user-b");
	});

	test("does not initialize scoped data while signed out", async () => {
		authSnapshot = {
			...authSnapshot,
			phase: "signed_out",
			user: null,
		};

		registerModuleMocks();

		const { PersistenceBootstrap } = await import(
			`@/providers/persistence-bootstrap?signed-out=${Math.random().toString(36).slice(2)}`
		);

		renderComponent(PersistenceBootstrap);
		await flushMicrotasks();

		expect(resetNotesUi).toHaveBeenCalledWith();
		expect(initializeNotes).not.toHaveBeenCalled();
		expect(syncPreferencesActor).not.toHaveBeenCalled();
		expect(syncSidebarActor).not.toHaveBeenCalled();
	});
});
