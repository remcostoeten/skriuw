import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getWorkspaceId, resolveWorkspaceId } from "@/platform/auth";
import { updateUserEditorPreferences } from "@/features/settings/lib/editor-preferences";
import { createDefaultProfile } from "./preferences/defaults";
import {
	MAX_ACTIVITY_ITEMS,
	MAX_RECENT_MOODS,
	applyAuthEditorPreferences,
	createActivityItem,
	normalizeProfile,
} from "./preferences/profile";
import type {
	ActivityAction,
	ActivityItem,
	AiKey,
	AiPreferences,
	AppearancePreferences,
	EditorPreferences,
	JournalPreferences,
	NotificationsPreferences,
	PersistedPreferencesState,
	PreferencesProfile,
	ProfilePreferences,
} from "./preferences/types";

// Re-exported for the few public consumers that import these from the store.
export type { AiKey, AiPreferences } from "./preferences/types";

interface PreferencesState {
	workspaceId: string | null;
	isLoading: boolean;
	isHydrated: boolean;
	profiles: Record<string, PreferencesProfile>;
	editor: EditorPreferences;
	appearance: AppearancePreferences;
	notifications: NotificationsPreferences;
	profile: ProfilePreferences;
	journal: JournalPreferences;
	ai: AiPreferences;
	amountOfNotes: number;
	activity: ActivityItem[];
	initialize: () => void;
	updateEditorPreference: <K extends keyof EditorPreferences>(
		key: K,
		value: EditorPreferences[K],
	) => void;
	updateAppearancePreference: <K extends keyof AppearancePreferences>(
		key: K,
		value: AppearancePreferences[K],
	) => void;
	updateNotificationsPreference: <K extends keyof NotificationsPreferences>(
		key: K,
		value: NotificationsPreferences[K],
	) => void;
	updateProfilePreference: <K extends keyof ProfilePreferences>(
		key: K,
		value: ProfilePreferences[K],
	) => void;
	updateAiPreference: <K extends keyof AiPreferences>(key: K, value: AiPreferences[K]) => void;
	addAiKey: (key: AiKey) => void;
	removeAiKey: (id: string) => void;
	setActiveAiKey: (id: string | null) => void;
	markAiKeyTested: (id: string) => void;
	toggleDiaryMode: () => void;
	recordMood: (mood: string) => void;
	incrementNoteCount: () => void;
	logActivity: (action: ActivityAction) => void;
	syncWorkspace: (workspaceId: string) => void;
}

/**
 * Flatten a profile onto the top-level store state for ergonomic access
 * via `state.editor.defaultFont` etc. The full per-workspace map lives in
 * `profiles`; this is the projection of the *active* workspace.
 */
function projectProfile(workspaceId: string, profile: PreferencesProfile) {
	return {
		workspaceId,
		isLoading: false,
		editor: profile.editor,
		appearance: profile.appearance,
		notifications: profile.notifications,
		profile: profile.profile,
		journal: profile.journal,
		ai: profile.ai,
		amountOfNotes: profile.amountOfNotes,
		activity: profile.activity,
	} satisfies Partial<PreferencesState>;
}

export const usePreferencesStore = create<PreferencesState>()(
	persist(
		(set, get) => {
			/**
			 * Apply a pure update to the active workspace's profile, writing
			 * both the profile map and the projected top-level fields.
			 *
			 * This collapses ~12 nearly-identical action bodies into a single
			 * shared shape:
			 *
			 *   mutate(state, current => ({ ...current, ... }))
			 */
			function mutate(updater: (profile: PreferencesProfile) => PreferencesProfile) {
				set((state) => {
					const workspaceId = resolveWorkspaceId(state.workspaceId);
					const current = normalizeProfile(state.profiles[workspaceId]);
					const next = updater(current);
					return {
						profiles: { ...state.profiles, [workspaceId]: next },
						...projectProfile(workspaceId, next),
					};
				});
			}

			return {
				workspaceId: null,
				isLoading: true,
				isHydrated: false,
				profiles: {},
				...createDefaultProfile(),

				initialize: () => {
					get().syncWorkspace(getWorkspaceId());
				},

				syncWorkspace: (workspaceId) => {
					set((state) => {
						const profile = applyAuthEditorPreferences(
							normalizeProfile(state.profiles[workspaceId]),
						);
						return {
							profiles: state.profiles[workspaceId]
								? state.profiles
								: { ...state.profiles, [workspaceId]: profile },
							...projectProfile(workspaceId, profile),
						};
					});
				},

				updateEditorPreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						editor: { ...profile.editor, [key]: value },
					}));

					if (key === "defaultFont") {
						void updateUserEditorPreferences({
							defaultFont: value as PreferencesProfile["editor"]["defaultFont"],
						});
					}
				},

				updateAppearancePreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						appearance: { ...profile.appearance, [key]: value },
					}));
				},

				updateNotificationsPreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						notifications: { ...profile.notifications, [key]: value },
					}));
				},

				updateProfilePreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						profile: { ...profile.profile, [key]: value },
					}));
				},

				updateAiPreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						ai: { ...profile.ai, [key]: value },
					}));
				},

				addAiKey: (key) => {
					mutate((profile) => ({
						...profile,
						ai: {
							...profile.ai,
							keys: [...profile.ai.keys, key],
							activeKeyId: profile.ai.activeKeyId ?? key.id,
						},
					}));
				},

				removeAiKey: (id) => {
					mutate((profile) => {
						const keys = profile.ai.keys.filter((k) => k.id !== id);
						const activeKeyId =
							profile.ai.activeKeyId === id
								? (keys[0]?.id ?? null)
								: profile.ai.activeKeyId;
						return { ...profile, ai: { ...profile.ai, keys, activeKeyId } };
					});
				},

				setActiveAiKey: (id) => {
					mutate((profile) => ({
						...profile,
						ai: { ...profile.ai, activeKeyId: id },
					}));
				},

				markAiKeyTested: (id) => {
					mutate((profile) => ({
						...profile,
						ai: {
							...profile.ai,
							keys: profile.ai.keys.map((k) =>
								k.id === id ? { ...k, tested: true } : k,
							),
						},
					}));
				},

				toggleDiaryMode: () => {
					mutate((profile) => ({
						...profile,
						journal: {
							...profile.journal,
							diaryModeEnabled: !profile.journal.diaryModeEnabled,
						},
						activity: [createActivityItem("diary_toggled"), ...profile.activity].slice(
							0,
							MAX_ACTIVITY_ITEMS,
						),
					}));
				},

				recordMood: (mood) => {
					mutate((profile) => ({
						...profile,
						journal: {
							...profile.journal,
							recentMoods: [
								{ mood, date: new Date() },
								...profile.journal.recentMoods,
							].slice(0, MAX_RECENT_MOODS),
						},
					}));
				},

				incrementNoteCount: () => {
					mutate((profile) => ({
						...profile,
						amountOfNotes: profile.amountOfNotes + 1,
						activity: [createActivityItem("note_created"), ...profile.activity].slice(
							0,
							MAX_ACTIVITY_ITEMS,
						),
					}));
				},

				logActivity: (action) => {
					mutate((profile) => ({
						...profile,
						activity: [createActivityItem(action), ...profile.activity].slice(
							0,
							MAX_ACTIVITY_ITEMS,
						),
					}));
				},
			};
		},
		{
			name: "preferences-store",
			storage: createJSONStorage(() => globalThis.localStorage),
			partialize: (state) => ({ profiles: state.profiles }),
			merge: (persistedState, currentState) => {
				const typedPersisted = (persistedState ?? {}) as PersistedPreferencesState;

				if (typedPersisted.profiles) {
					return {
						...currentState,
						profiles: Object.fromEntries(
							Object.entries(typedPersisted.profiles).map(
								([workspaceId, profile]) => [
									workspaceId,
									normalizeProfile(profile),
								],
							),
						),
					};
				}

				const hasLegacyState =
					typedPersisted.userId !== undefined ||
					typedPersisted.editor !== undefined ||
					typedPersisted.journal !== undefined ||
					typedPersisted.amountOfNotes !== undefined ||
					typedPersisted.activity !== undefined;

				if (!hasLegacyState || !typedPersisted.userId) {
					return currentState;
				}

				return {
					...currentState,
					profiles: {
						[typedPersisted.userId]: normalizeProfile({
							editor: typedPersisted.editor,
							journal: typedPersisted.journal,
							amountOfNotes: typedPersisted.amountOfNotes,
							activity: typedPersisted.activity as ActivityItem[] | undefined,
						}),
					},
				};
			},
			onRehydrateStorage: () => (state) => {
				if (state) {
					state.isHydrated = true;
					state.isLoading = state.workspaceId === null;
				}
			},
		},
	),
);
