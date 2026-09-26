import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualReact from "react";
import type { AuthSnapshot } from "@/core/auth";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";

let authSnapshot: AuthSnapshot;
let store: Map<string, unknown>;
let setCalls: { key: unknown; value: unknown }[];
let mergedNotesOverride: NoteFile[] | null;

function keyStr(key: unknown): string {
	return JSON.stringify(key);
}

function makeQueryClient() {
	return {
		getQueryData: (key: unknown) => store.get(keyStr(key)),
		setQueryData: (key: unknown, value: unknown) => {
			store.set(keyStr(key), value);
			setCalls.push({ key, value });
		},
	};
}

function note(id: string): NoteFile {
	return {
		id,
		name: `${id}.md`,
		content: "",
		richContent: [],
		preferredEditorMode: "block",
		createdAt: new Date("2024-01-01T00:00:00Z"),
		modifiedAt: new Date("2024-01-01T00:00:00Z"),
		parentId: null,
		sortOrder: 0,
		tags: [],
	};
}

// Render the component as a plain function — its useEffect is mocked to run
// synchronously, and it returns null.
function renderComponent(Component: () => null) {
	return Component();
}

function registerModuleMocks() {
	// Spread the real react module so this mock stays a complete module (with a
	// `default` export and every other hook) even if bun leaks it into another
	// isolated test file; only `useEffect` is swapped for a synchronous stub so
	// the bootstrap component runs as a plain function call.
	const reactMock = {
		...actualReact,
		useEffect: (callback: () => void | (() => void)) => {
			callback();
		},
	};
	mock.module("react", () => ({ ...reactMock, default: reactMock }));

	mock.module("@/core/auth/use-auth", () => ({
		useAuth: () => authSnapshot,
	}));

	mock.module("@tanstack/react-query", () => ({
		useQueryClient: () => makeQueryClient(),
		useQuery: () => ({ data: undefined, isPending: false, isFetching: false }),
		useMutation: (options: any) => options,
	}));

	// Identity merge so the test asserts the bootstrap's own wiring, not the
	// merge logic (covered in local-backend.test.ts).
	mock.module("@/core/workspace-backend", () => ({
		mergeSeedWithGuestWorkspace: async (notes: NoteFile[], folders: NoteFolder[]) => ({
			notes: mergedNotesOverride ?? notes,
			folders,
		}),
		useIsGuestWorkspace: () => false,
		useWorkspaceCapabilities: () => ({}),
		isTauriRuntime: () => false,
		createTauriBackend: () => ({}),
		tauriInvoke: async () => undefined,
		tauriChannel: () => ({}),
		useWorkspaceBackend: () => ({}),
		WorkspaceBackendProvider: ({ children }: { children?: unknown }) => children,
		WorkspaceCapabilityError: class WorkspaceCapabilityError extends Error {},
		serverBackend: {},
		createLocalBackend: () => ({}),
		mergeSeedWithGuestNotes: (notes: unknown) => notes,
		mergeSeedWithGuestFolders: (folders: unknown) => folders,
		resetGuestStorage: () => undefined,
		GUEST_SIGNUP_PROMPT_EVENT: "guest-signup-prompt",
		recordGuestGraphExplore: () => undefined,
	}));
}

beforeEach(() => {
	store = new Map();
	setCalls = [];
	mergedNotesOverride = null;
	authSnapshot = {
		phase: "signed_out",
		rememberMe: false,
		isReady: true,
		user: null,
		error: null,
	};
});

afterEach(() => {
	mock.restore();
});

describe("GuestWorkspaceBootstrap", () => {
	test("preserves hydrated cache timestamps when the guest has no local edits", async () => {
		const localScope = notesKeys.localScope();
		store.set(keyStr(notesKeys.files(localScope)), [note("guest:a")]);
		store.set(keyStr(notesKeys.folders(localScope)), []);

		registerModuleMocks();
		const { GuestWorkspaceBootstrap } = await import(
			`@/providers/guest-workspace-bootstrap?unchanged=${Math.random().toString(36).slice(2)}`
		);
		renderComponent(GuestWorkspaceBootstrap);
		await Promise.resolve();

		expect(setCalls).toHaveLength(0);
	});

	test("merges seed data and only seeds detail cache for local guest overrides", async () => {
		const seedA = note("guest:a");
		const seedB = note("guest:b");
		const localOverride = { ...note("guest:c"), content: "local edit" };
		const localScope = notesKeys.localScope();
		store.set(keyStr(notesKeys.files(localScope)), [seedA, seedB]);
		mergedNotesOverride = [seedA, seedB, localOverride];
		store.set(keyStr(notesKeys.folders(localScope)), [
			{ id: "guest:f", name: "F", parentId: null, sortOrder: 0, isOpen: true },
		]);

		registerModuleMocks();
		const { GuestWorkspaceBootstrap } = await import(
			`@/providers/guest-workspace-bootstrap?guest=${Math.random().toString(36).slice(2)}`
		);
		renderComponent(GuestWorkspaceBootstrap);
		await Promise.resolve();

		expect(store.get(keyStr(notesKeys.detail("guest:a")))).toBeUndefined();
		expect(store.get(keyStr(notesKeys.detail("guest:b")))).toBeUndefined();
		expect(store.get(keyStr(notesKeys.detail("guest:c")))).toMatchObject({
			content: "local edit",
		});
		const detailWrites = setCalls.filter(
			(c) =>
				keyStr(c.key).includes("guest:a") ||
				keyStr(c.key).includes("guest:b") ||
				keyStr(c.key).includes("guest:c"),
		);
		expect(detailWrites).toHaveLength(1);
	});

	test("does nothing when authenticated", async () => {
		authSnapshot = {
			...authSnapshot,
			phase: "authenticated",
			user: { id: "u", email: "", name: "", role: null, username: null, avatarColor: null },
		};
		store.set(keyStr(notesKeys.files(notesKeys.localScope())), [note("guest:a")]);

		registerModuleMocks();
		const { GuestWorkspaceBootstrap } = await import(
			`@/providers/guest-workspace-bootstrap?authed=${Math.random().toString(36).slice(2)}`
		);
		renderComponent(GuestWorkspaceBootstrap);
		await Promise.resolve();

		expect(setCalls).toHaveLength(0);
	});
});
