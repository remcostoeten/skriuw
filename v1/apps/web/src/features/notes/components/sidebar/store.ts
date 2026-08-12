import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getUserScopeId, resolveUserScopeId } from "@/core/auth";
import {
	DEFAULT_SECTIONS,
	DEFAULT_SIDEBAR_CONFIG,
	DEFAULT_MAX_RECENTS,
	resolveProjectColorClass,
	type FavoriteItem,
	type RecentItem,
	type SidebarConfig,
	type SidebarSection,
} from "./types";

type SidebarState = {
	currentUserScopeId: string;
	config: SidebarConfig;
	isLoading: boolean;
	isHydrated: boolean;
	profiles: Record<string, SidebarConfig>;

	syncUserScope: (userScopeId: string) => void;
	getSections: () => SidebarSection[];
	toggleSectionCollapse: (sectionId: string) => void;
	toggleSectionVisibility: (sectionId: string) => void;
	reorderSections: (sectionIds: string[]) => void;
	addCustomSection: (name: string) => void;
	removeSection: (sectionId: string) => void;
	renameSection: (sectionId: string, name: string) => void;
	setCustomSectionColor: (sectionId: string, color: string) => void;
	addToCustomSection: (sectionId: string, itemId: string, itemType: "file" | "folder") => void;
	removeFromCustomSection: (
		sectionId: string,
		itemId: string,
		itemType: "file" | "folder",
	) => void;

	addToFavorites: (itemId: string, itemType: "file" | "folder") => void;
	removeFromFavorites: (itemId: string) => void;
	isFavorite: (itemId: string) => boolean;

	addToRecents: (
		itemId: string,
		itemType: "file" | "folder",
		meta?: { name?: string; icon?: string },
	) => void;
	clearRecents: () => void;
	getRecents: () => RecentItem[];
	setMaxRecents: (max: number) => void;

	toggleShowSectionHeaders: () => void;
	toggleCompactMode: () => void;
	setCompactMode: (compactMode: boolean) => void;
	toggleTreeGuides: () => void;
	resetToDefaults: () => void;
};

type PersistedSidebarState = {
	currentUserScopeId?: string;
	profiles?: Record<string, SidebarConfig>;
	config?: SidebarConfig;
};

function cloneSidebarConfig(config: SidebarConfig = DEFAULT_SIDEBAR_CONFIG): SidebarConfig {
	const sectionsById = new Map((config.sections ?? []).map((section) => [section.id, section]));
	const normalizedDefaultSections = DEFAULT_SECTIONS.map((defaultSection) => {
		const section = sectionsById.get(defaultSection.id);
		if (!section) return { ...defaultSection };

		return {
			...defaultSection,
			...section,
			// The notes tree is the primary navigation surface; always restore it to
			// a visible, open state regardless of older persisted profiles. The journal
			// section may be collapsed/hidden and that choice persists.
			isVisible: defaultSection.type === "file-tree" ? true : section.isVisible,
			isCollapsed: defaultSection.type === "file-tree" ? false : section.isCollapsed,
		};
	});
	const customSections = (config.sections ?? []).reduce<SidebarSection[]>((acc, section) => {
		if (section.type === "custom") acc.push({ ...section });
		return acc;
	}, []);

	// Legacy "Projects" were a parallel manual-grouping concept. They are folded
	// into custom sections (a project becomes a colored custom section). This runs
	// on every load but is idempotent: migrated projects are emptied from the
	// `projects` array below, and the stable id guards against re-importing.
	const existingCustomIds = new Set(customSections.map((section) => section.id));
	const migratedProjectSections = (config.projects ?? []).flatMap((project, index) => {
		const id = `custom-project-${project.id}`;
		if (existingCustomIds.has(id)) return [];
		return [
			{
				id,
				type: "custom" as const,
				name: project.name,
				isCollapsed: false,
				isVisible: true,
				order: normalizedDefaultSections.length + customSections.length + index,
				customConfig: {
					color: resolveProjectColorClass(project.color),
					fileIds: [...project.fileIds],
					folderIds: [...project.folderIds],
				},
			},
		];
	});

	return {
		sections: [...normalizedDefaultSections, ...customSections, ...migratedProjectSections].map(
			(section) => ({
				...section,
				customConfig: section.customConfig
					? {
							...section.customConfig,
							fileIds: [...(section.customConfig.fileIds ?? [])],
							folderIds: [...(section.customConfig.folderIds ?? [])],
						}
					: undefined,
			}),
		),
		favorites: (config.favorites ?? []).map((favorite) => ({ ...favorite })),
		recents: (config.recents ?? []).map((recent) => ({ ...recent })),
		// Projects are retired and folded into custom sections (see above), so the
		// projects array is always emptied once migrated.
		projects: [],
		maxRecents: Math.max(config.maxRecents ?? DEFAULT_MAX_RECENTS, DEFAULT_MAX_RECENTS),
		showSectionHeaders: config.showSectionHeaders ?? DEFAULT_SIDEBAR_CONFIG.showSectionHeaders,
		compactMode: config.compactMode ?? DEFAULT_SIDEBAR_CONFIG.compactMode,
		showTreeGuides: config.showTreeGuides ?? DEFAULT_SIDEBAR_CONFIG.showTreeGuides,
	};
}

function readUserScopeConfig(
	profiles: Record<string, SidebarConfig>,
	userScopeId: string,
): SidebarConfig {
	return cloneSidebarConfig(profiles[userScopeId] ?? DEFAULT_SIDEBAR_CONFIG);
}

export const useSidebarStore = create<SidebarState>()(
	persist(
		(set, get) => {
			const applyUserScopeUpdate = (
				updater: (config: SidebarConfig, state: SidebarState) => SidebarConfig,
			) => {
				set((state) => {
					const userScopeId = resolveUserScopeId(state.currentUserScopeId);
					const nextConfig = updater(cloneSidebarConfig(state.config), state);

					return {
						currentUserScopeId: userScopeId,
						config: nextConfig,
						profiles: {
							...state.profiles,
							[userScopeId]: nextConfig,
						},
					};
				});
			};

			return {
				currentUserScopeId: getUserScopeId(),
				config: cloneSidebarConfig(),
				isLoading: false,
				isHydrated: false,
				profiles: {},

				syncUserScope: (userScopeId: string) => {
					const nextUserScopeId = resolveUserScopeId(userScopeId);
					const profiles = get().profiles;
					const nextConfig = readUserScopeConfig(profiles, nextUserScopeId);

					set({
						currentUserScopeId: nextUserScopeId,
						config: nextConfig,
						profiles,
						isLoading: false,
						isHydrated: true,
					});
				},

				getSections: () => {
					return get()
						.config.sections.filter((section) => section.isVisible)
						.toSorted((left, right) => {
							if (left.type === "file-tree" && right.type !== "file-tree") return -1;
							if (right.type === "file-tree" && left.type !== "file-tree") return 1;
							return left.order - right.order;
						});
				},

				toggleSectionCollapse: (sectionId: string) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) =>
							section.id === sectionId
								? { ...section, isCollapsed: !section.isCollapsed }
								: section,
						),
					}));
				},

				toggleSectionVisibility: (sectionId: string) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) =>
							section.id === sectionId
								? { ...section, isVisible: !section.isVisible }
								: section,
						),
					}));
				},

				reorderSections: (sectionIds: string[]) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) => ({
							...section,
							order: sectionIds.indexOf(section.id),
						})),
					}));
				},

				addCustomSection: (name: string) => {
					applyUserScopeUpdate((config) => {
						const newSection: SidebarSection = {
							id: `custom-${crypto.randomUUID()}`,
							type: "custom",
							name,
							isCollapsed: false,
							isVisible: true,
							order: config.sections.length,
							customConfig: {
								fileIds: [],
								folderIds: [],
							},
						};

						return {
							...config,
							sections: [...config.sections, newSection],
						};
					});
				},

				removeSection: (sectionId: string) => {
					applyUserScopeUpdate((config) => {
						const section = config.sections.find((item) => item.id === sectionId);
						if (section?.type !== "custom") return config;

						return {
							...config,
							sections: config.sections.filter((section) => section.id !== sectionId),
						};
					});
				},

				renameSection: (sectionId: string, name: string) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) =>
							section.id === sectionId ? { ...section, name } : section,
						),
					}));
				},

				setCustomSectionColor: (sectionId: string, color: string) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) =>
							section.id === sectionId && section.type === "custom"
								? {
										...section,
										customConfig: {
											...(section.customConfig ?? {
												fileIds: [],
												folderIds: [],
											}),
											color: resolveProjectColorClass(color),
										},
									}
								: section,
						),
					}));
				},

				addToCustomSection: (
					sectionId: string,
					itemId: string,
					itemType: "file" | "folder",
				) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) => {
							if (section.id !== sectionId || section.type !== "custom")
								return section;

							const customConfig = section.customConfig ?? {
								fileIds: [],
								folderIds: [],
							};

							const fileIdSet = new Set(customConfig.fileIds);
							const folderIdSet = new Set(customConfig.folderIds);

							if (itemType === "file") {
								if (fileIdSet.has(itemId)) return section;
								return {
									...section,
									customConfig: {
										...customConfig,
										fileIds: [...(customConfig.fileIds ?? []), itemId],
									},
								};
							}

							if (folderIdSet.has(itemId)) return section;
							return {
								...section,
								customConfig: {
									...customConfig,
									folderIds: [...(customConfig.folderIds ?? []), itemId],
								},
							};
						}),
					}));
				},

				removeFromCustomSection: (
					sectionId: string,
					itemId: string,
					itemType: "file" | "folder",
				) => {
					applyUserScopeUpdate((config) => ({
						...config,
						sections: config.sections.map((section) => {
							if (section.id !== sectionId || section.type !== "custom")
								return section;

							const customConfig = section.customConfig ?? {
								fileIds: [],
								folderIds: [],
							};

							return {
								...section,
								customConfig: {
									...customConfig,
									fileIds:
										itemType === "file"
											? (customConfig.fileIds ?? []).filter(
													(id) => id !== itemId,
												)
											: (customConfig.fileIds ?? []),
									folderIds:
										itemType === "folder"
											? (customConfig.folderIds ?? []).filter(
													(id) => id !== itemId,
												)
											: (customConfig.folderIds ?? []),
								},
							};
						}),
					}));
				},

				addToFavorites: (itemId: string, itemType: "file" | "folder") => {
					applyUserScopeUpdate((config) => {
						const existing = config.favorites.find(
							(favorite) => favorite.itemId === itemId,
						);
						if (existing) return config;

						const newFavorite: FavoriteItem = {
							id: crypto.randomUUID(),
							itemId,
							itemType,
							addedAt: new Date(),
						};

						return {
							...config,
							favorites: [...config.favorites, newFavorite],
						};
					});
				},

				removeFromFavorites: (itemId: string) => {
					applyUserScopeUpdate((config) => ({
						...config,
						favorites: config.favorites.filter(
							(favorite) => favorite.itemId !== itemId,
						),
					}));
				},

				isFavorite: (itemId: string) => {
					return get().config.favorites.some((favorite) => favorite.itemId === itemId);
				},

				addToRecents: (
					itemId: string,
					itemType: "file" | "folder",
					meta?: { name?: string; icon?: string },
				) => {
					applyUserScopeUpdate((config) => {
						const filtered = config.recents.filter(
							(recent) => recent.itemId !== itemId,
						);

						const newRecent: RecentItem = {
							id: crypto.randomUUID(),
							itemId,
							itemType,
							accessedAt: new Date(),
							name: meta?.name,
							icon: meta?.icon,
						};

						return {
							...config,
							recents: [newRecent, ...filtered].slice(0, config.maxRecents),
						};
					});
				},

				clearRecents: () => {
					applyUserScopeUpdate((config) => ({
						...config,
						recents: [],
					}));
				},

				getRecents: () => {
					return get().config.recents;
				},

				setMaxRecents: (max: number) => {
					applyUserScopeUpdate((config) => ({
						...config,
						maxRecents: max,
						recents: config.recents.slice(0, max),
					}));
				},

				toggleShowSectionHeaders: () => {
					applyUserScopeUpdate((config) => ({
						...config,
						showSectionHeaders: !config.showSectionHeaders,
					}));
				},

				toggleCompactMode: () => {
					applyUserScopeUpdate((config) => ({
						...config,
						compactMode: !config.compactMode,
					}));
				},

				setCompactMode: (compactMode: boolean) => {
					applyUserScopeUpdate((config) => ({
						...config,
						compactMode,
					}));
				},

				toggleTreeGuides: () => {
					applyUserScopeUpdate((config) => ({
						...config,
						showTreeGuides: !config.showTreeGuides,
					}));
				},

				resetToDefaults: () => {
					applyUserScopeUpdate(() => cloneSidebarConfig());
				},
			};
		},
		{
			name: "skriuw-sidebar",
			partialize: (state) => ({ profiles: state.profiles }),
			merge: (persistedState, currentState) => {
				const state = persistedState as PersistedSidebarState | undefined;
				const userScopeId = getUserScopeId();
				const profiles = {
					...state?.profiles,
				};

				if (!profiles[userScopeId]) {
					if (state?.config) {
						profiles[userScopeId] = cloneSidebarConfig(state.config);
					} else {
						profiles[userScopeId] = cloneSidebarConfig();
					}
				}

				const nextConfig = readUserScopeConfig(profiles, userScopeId);

				return {
					...currentState,
					profiles,
					currentUserScopeId: userScopeId,
					config: nextConfig,
					isLoading: false,
					isHydrated: true,
				};
			},
			onRehydrateStorage: () => (state) => {
				if (state) {
					state.isLoading = false;
					state.isHydrated = true;
				}
			},
		},
	),
);
