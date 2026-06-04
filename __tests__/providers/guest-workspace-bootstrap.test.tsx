import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthSnapshot } from "@/core/auth";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";

type MockFn = (...args: any[]) => any;
const createMock = mock as unknown as (implementation: MockFn) => MockFn;

let authSnapshot: AuthSnapshot;
let store: Map<string, unknown>;
let setCalls: { key: unknown; value: unknown }[];

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
	mock.module("react", () => ({
		useEffect: (callback: () => void | (() => void)) => {
			callback();
		},
	}));

	mock.module("@/core/auth/use-auth", () => ({
		useAuth: () => authSnapshot,
	}));

	mock.module("@tanstack/react-query", () => ({
		useQueryClient: () => makeQueryClient(),
	}));

	// Identity merge so the test asserts the bootstrap's own wiring, not the
	// merge logic (covered in local-backend.test.ts).
	mock.module("@/core/workspace-backend", () => ({
		mergeSeedWithGuestNotes: (notes: NoteFile[]) => notes,
		mergeSeedWithGuestFolders: (folders: NoteFolder[]) => folders,
	}));
}

beforeEach(() => {
	store = new Map();
	setCalls = [];
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
	test("merges seed data and seeds the detail cache for every note when guest", async () => {
		store.set(keyStr(notesKeys.files()), [note("guest:a"), note("guest:b")]);
		store.set(keyStr(notesKeys.folders()), [
			{ id: "guest:f", name: "F", parentId: null, sortOrder: 0, isOpen: true },
		]);

		registerModuleMocks();
		const { GuestWorkspaceBootstrap } = await import(
			`@/providers/guest-workspace-bootstrap?guest=${Math.random().toString(36).slice(2)}`
		);
		renderComponent(GuestWorkspaceBootstrap);

		// files + folders + one detail per note.
		expect(store.get(keyStr(notesKeys.detail("guest:a")))).toBeDefined();
		expect(store.get(keyStr(notesKeys.detail("guest:b")))).toBeDefined();
		const detailWrites = setCalls.filter((c) =>
			keyStr(c.key).includes("guest:a") || keyStr(c.key).includes("guest:b"),
		);
		expect(detailWrites).toHaveLength(2);
	});

	test("does nothing when authenticated", async () => {
		authSnapshot = { ...authSnapshot, phase: "authenticated", user: { id: "u", email: "", name: "", role: null } };
		store.set(keyStr(notesKeys.files()), [note("guest:a")]);

		registerModuleMocks();
		const { GuestWorkspaceBootstrap } = await import(
			`@/providers/guest-workspace-bootstrap?authed=${Math.random().toString(36).slice(2)}`
		);
		renderComponent(GuestWorkspaceBootstrap);

		expect(setCalls).toHaveLength(0);
	});
});
