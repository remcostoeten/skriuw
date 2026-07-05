import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { RecentItem, SidebarSection } from "@/features/notes/components/sidebar/types";
import type { FavoriteItem } from "@/features/notes/components/sidebar/types";
import { MemoryStorage } from "../../../../lib/memory-storage";
import { installMockLocalStorage } from "../../../../lib/mock-globals";

let authUserScopeId = "signed-out-local";
let storage: MemoryStorage;
let restoreLocalStorage: () => void;

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

async function loadStoreModule() {
	mock.module("zustand", () => {
		const createBoundStore = (creator: StateCreator<unknown>) => {
			const store = createStore(creator);
			const useBoundStore = (selector?: (state: unknown) => unknown) =>
				selector ? selector(store.getState()) : store.getState();
			return Object.assign(useBoundStore, store);
		};

		return {
			create: (creator?: StateCreator<unknown>) =>
				creator ? createBoundStore(creator) : createBoundStore,
		};
	});

	const authModuleMock = {
		getUserScopeId: () => authUserScopeId,
		resolveUserScopeId: (userScopeId?: string | null) => userScopeId ?? authUserScopeId,
	};
	mock.module("@/core/auth", () => authModuleMock);
	mock.module("@/core/auth/index", () => authModuleMock);

	return import(
		`@/features/notes/components/sidebar/store?test=${Math.random().toString(36).slice(2)}`
	);
}

function readPersistedSidebarState() {
	const raw = storage.getItem("skriuw-sidebar");
	return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
	authUserScopeId = "signed-out-local";
	storage = new MemoryStorage();
	restoreLocalStorage = installMockLocalStorage(storage);
});

afterEach(() => {
	mock.restore();
	storage.clear();
	restoreLocalStorage();
});

describe("sidebar store user scope scoping", () => {
	test("normalizes older low recent caps so history can grow beyond the preview size", async () => {
		authUserScopeId = "user-a";
		storage.setItem(
			"skriuw-sidebar",
			JSON.stringify({
				state: {
					profiles: {
						"user-a": {
							sections: [],
							favorites: [],
							recents: [],
							projects: [],
							maxRecents: 6,
							showSectionHeaders: true,
							compactMode: false,
						},
					},
				},
				version: 0,
			}),
		);

		const { useSidebarStore } = await loadStoreModule();
		await flushMicrotasks();

		for (let index = 0; index < 8; index += 1) {
			useSidebarStore.getState().addToRecents(`file-${index}`, "file");
		}

		expect(useSidebarStore.getState().config.maxRecents).toBeGreaterThanOrEqual(50);
		expect(useSidebarStore.getState().config.recents).toHaveLength(8);
	});

	test("restores the required file tree section from older persisted profiles", async () => {
		authUserScopeId = "user-a";
		const { useSidebarStore } = await loadStoreModule();

		await flushMicrotasks();

		useSidebarStore.setState({
			profiles: {
				"user-a": {
					sections: [
						{
							id: "journal",
							type: "journal",
							name: "Journal",
							isCollapsed: false,
							isVisible: true,
							order: 2,
						},
						{
							id: "recents",
							type: "recents",
							name: "Recents",
							isCollapsed: false,
							isVisible: true,
							order: 4,
						},
						{
							id: "projects",
							type: "projects",
							name: "Projects",
							isCollapsed: false,
							isVisible: true,
							order: 5,
						},
					],
					favorites: [],
					recents: [],
					projects: [],
					maxRecents: 10,
					showSectionHeaders: true,
					compactMode: false,
				},
				"user-b": {
					sections: [
						{
							id: "file-tree",
							type: "file-tree",
							name: "All Notes",
							isCollapsed: false,
							isVisible: false,
							order: 0,
						},
					],
					favorites: [],
					recents: [],
					projects: [],
					maxRecents: 10,
					showSectionHeaders: true,
					compactMode: false,
				},
			},
		});

		useSidebarStore.getState().syncUserScope("user-a");

		expect(
			useSidebarStore
				.getState()
				.getSections()
				.some((section: SidebarSection) => section.id === "file-tree"),
		).toBe(true);

		useSidebarStore.getState().syncUserScope("user-b");

		expect(
			useSidebarStore
				.getState()
				.getSections()
				.find((section: SidebarSection) => section.id === "file-tree")?.isVisible,
		).toBe(true);
	});

	test("preserves the journal section collapse state from persisted profiles", async () => {
		authUserScopeId = "user-a";
		const { useSidebarStore } = await loadStoreModule();

		await flushMicrotasks();

		useSidebarStore.setState({
			profiles: {
				"user-a": {
					sections: [
						{
							id: "file-tree",
							type: "file-tree",
							name: "All Notes",
							isCollapsed: false,
							isVisible: true,
							order: 0,
						},
						{
							id: "journal",
							type: "journal",
							name: "Journal",
							isCollapsed: true,
							isVisible: true,
							order: 2,
						},
					],
					favorites: [],
					recents: [],
					projects: [],
					maxRecents: 10,
					showSectionHeaders: true,
					compactMode: false,
				},
			},
		});

		useSidebarStore.getState().syncUserScope("user-a");

		// The journal section is now user-collapsible and its state persists,
		// rather than being force-expanded on load.
		expect(
			useSidebarStore
				.getState()
				.getSections()
				.find((section: SidebarSection) => section.id === "journal")?.isCollapsed,
		).toBe(true);

		useSidebarStore.getState().toggleSectionCollapse("journal");

		expect(
			useSidebarStore
				.getState()
				.getSections()
				.find((section: SidebarSection) => section.id === "journal")?.isCollapsed,
		).toBe(false);
	});

	test("keeps favorites, recents, custom sections, and visibility prefs isolated per user scope", async () => {
		authUserScopeId = "user-a";
		const { useSidebarStore } = await loadStoreModule();

		await flushMicrotasks();

		useSidebarStore.getState().toggleSectionVisibility("search");
		useSidebarStore.getState().toggleCompactMode();
		useSidebarStore.getState().toggleTreeGuides();
		useSidebarStore.getState().addCustomSection("A Custom");
		useSidebarStore.getState().addToFavorites("file-a", "file");
		useSidebarStore.getState().addToRecents("file-a", "file");
		const userScopeASection = useSidebarStore
			.getState()
			.config.sections.find((section: SidebarSection) => section.type === "custom");
		if (!userScopeASection) {
			throw new Error("Expected user scope A custom section.");
		}
		useSidebarStore.getState().addToCustomSection(userScopeASection.id, "file-a", "file");
		await flushMicrotasks();

		authUserScopeId = "user-b";
		await useSidebarStore.getState().syncUserScope("user-b");
		await flushMicrotasks();

		expect(useSidebarStore.getState().config.favorites).toHaveLength(0);
		expect(useSidebarStore.getState().config.recents).toHaveLength(0);
		expect(useSidebarStore.getState().config.projects).toHaveLength(0);
		expect(useSidebarStore.getState().config.compactMode).toBe(false);
		expect(useSidebarStore.getState().config.showTreeGuides).toBe(false);
		expect(
			useSidebarStore
				.getState()
				.config.sections.find((section: SidebarSection) => section.id === "search")
				?.isVisible,
		).toBe(true);
		expect(
			useSidebarStore
				.getState()
				.config.sections.some((section: SidebarSection) => section.type === "custom"),
		).toBe(false);

		useSidebarStore.getState().toggleSectionVisibility("favorites");
		useSidebarStore.getState().toggleShowSectionHeaders();
		useSidebarStore.getState().addCustomSection("B Custom");
		useSidebarStore.getState().addToFavorites("file-b", "file");
		useSidebarStore.getState().addToRecents("file-b", "file");
		const userScopeBSection = useSidebarStore
			.getState()
			.config.sections.find((section: SidebarSection) => section.type === "custom");
		if (!userScopeBSection) {
			throw new Error("Expected user scope B custom section.");
		}
		useSidebarStore.getState().addToCustomSection(userScopeBSection.id, "file-b", "file");
		await flushMicrotasks();

		const persistedState = readPersistedSidebarState();
		expect(persistedState).not.toBeNull();
		expect(Object.keys(persistedState.state.profiles)).toEqual(
			expect.arrayContaining(["user-a", "user-b"]),
		);
		expect(
			persistedState.state.profiles["user-a"].favorites.map(
				(item: { itemId: string }) => item.itemId,
			),
		).toEqual(["file-a"]);
		expect(
			persistedState.state.profiles["user-b"].favorites.map(
				(item: { itemId: string }) => item.itemId,
			),
		).toEqual(["file-b"]);

		authUserScopeId = "user-a";
		await useSidebarStore.getState().syncUserScope("user-a");
		await flushMicrotasks();

		expect(
			useSidebarStore.getState().config.favorites.map((item: FavoriteItem) => item.itemId),
		).toEqual(["file-a"]);
		expect(
			useSidebarStore.getState().config.recents.map((item: RecentItem) => item.itemId),
		).toEqual(["file-a"]);
		expect(
			useSidebarStore
				.getState()
				.config.sections.find((section: SidebarSection) => section.type === "custom")?.name,
		).toBe("A Custom");
		expect(
			useSidebarStore
				.getState()
				.config.sections.find((section: SidebarSection) => section.id === "search")
				?.isVisible,
		).toBe(false);
		expect(useSidebarStore.getState().config.compactMode).toBe(true);
		expect(useSidebarStore.getState().config.showTreeGuides).toBe(true);

		authUserScopeId = "user-b";
		await useSidebarStore.getState().syncUserScope("user-b");
		await flushMicrotasks();

		expect(
			useSidebarStore.getState().config.favorites.map((item: FavoriteItem) => item.itemId),
		).toEqual(["file-b"]);
		expect(
			useSidebarStore.getState().config.recents.map((item: RecentItem) => item.itemId),
		).toEqual(["file-b"]);
		expect(
			useSidebarStore
				.getState()
				.config.sections.find((section: SidebarSection) => section.type === "custom")?.name,
		).toBe("B Custom");
		expect(
			useSidebarStore
				.getState()
				.config.sections.find((section: SidebarSection) => section.id === "favorites")
				?.isVisible,
		).toBe(false);
		expect(useSidebarStore.getState().config.showSectionHeaders).toBe(false);
	});

	test("migrates legacy projects into colored custom sections", async () => {
		authUserScopeId = "user-a";
		storage.setItem(
			"skriuw-sidebar",
			JSON.stringify({
				state: {
					profiles: {
						"user-a": {
							sections: [],
							favorites: [],
							recents: [],
							projects: [
								{
									id: "p1",
									name: "Legacy Project",
									color: "bg-project-blue",
									fileIds: ["file-a"],
									folderIds: ["folder-x"],
									createdAt: new Date().toISOString(),
									updatedAt: new Date().toISOString(),
								},
							],
							maxRecents: 50,
							showSectionHeaders: true,
							compactMode: false,
						},
					},
				},
				version: 0,
			}),
		);

		const { useSidebarStore } = await loadStoreModule();
		await flushMicrotasks();

		const sections = useSidebarStore.getState().config.sections;
		const migrated = sections.find(
			(section: SidebarSection) =>
				section.type === "custom" && section.name === "Legacy Project",
		);

		// The project becomes a colored custom section carrying its items...
		expect(migrated).toBeDefined();
		expect(migrated?.customConfig?.color).toBe("bg-project-blue");
		expect(migrated?.customConfig?.fileIds).toEqual(["file-a"]);
		expect(migrated?.customConfig?.folderIds).toEqual(["folder-x"]);
		// ...and the legacy projects array is emptied.
		expect(useSidebarStore.getState().config.projects).toHaveLength(0);

		// Migration is idempotent: re-syncing does not duplicate the section.
		useSidebarStore.getState().syncUserScope("user-a");
		const customCount = useSidebarStore
			.getState()
			.config.sections.filter(
				(section: SidebarSection) =>
					section.type === "custom" && section.name === "Legacy Project",
			).length;
		expect(customCount).toBe(1);
	});
});
