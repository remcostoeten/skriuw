import { optIn, optOut } from "@remcostoeten/analytics";
import { startTransition } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getUserScopeId, resolveUserScopeId, SIGNED_OUT_USER_SCOPE } from "@/core/auth";
import { setTagDetectionEnabled } from "@/domain/notes/tag-detection";
import { setMarkDetectionEnabled } from "@/domain/notes/mark-detection";
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
	PersistedPreferencesState,
	PreferencesProfile,
	PrivacyPreferences,
	ProfilePreferences,
	QuickAccessPreferences,
} from "./preferences/types";

// Re-exported for the few public consumers that import these from the store.
export type { AiKey, AiPreferences } from "./preferences/types";

type PreferencesState = {
	userScopeId: string | null;
	isLoading: boolean;
	isHydrated: boolean;
	profiles: Record<string, PreferencesProfile>;
	editor: EditorPreferences;
	appearance: AppearancePreferences;
	profile: ProfilePreferences;
	journal: JournalPreferences;
	privacy: PrivacyPreferences;
	ai: AiPreferences;
	quickAccess: QuickAccessPreferences;
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
	updateProfilePreference: <K extends keyof ProfilePreferences>(
		key: K,
		value: ProfilePreferences[K],
	) => void;
	updatePrivacyPreference: <K extends keyof PrivacyPreferences>(
		key: K,
		value: PrivacyPreferences[K],
	) => void;
	updateAiPreference: <K extends keyof AiPreferences>(key: K, value: AiPreferences[K]) => void;
	updateQuickAccessPreference: <K extends keyof QuickAccessPreferences>(
		key: K,
		value: QuickAccessPreferences[K],
	) => void;
	addAiKey: (key: AiKey) => void;
	removeAiKey: (id: string) => void;
	setActiveAiKey: (id: string | null) => void;
	markAiKeyTested: (id: string) => void;
	toggleDiaryMode: () => void;
	recordMood: (mood: string) => void;
	incrementNoteCount: () => void;
	logActivity: (action: ActivityAction) => void;
	syncUserScope: (userScopeId: string) => void;
};

/**
 * Flatten a profile onto the top-level store state for ergonomic access
 * via `state.editor.defaultFont` etc. The full per-user map lives in
 * `profiles`; this is the projection of the *active* user scope.
 */
function projectProfile(userScopeId: string, profile: PreferencesProfile) {
	return {
		userScopeId,
		isLoading: false,
		editor: profile.editor,
		appearance: profile.appearance,
		profile: profile.profile,
		journal: profile.journal,
		privacy: profile.privacy,
		ai: profile.ai,
		quickAccess: profile.quickAccess,
		amountOfNotes: profile.amountOfNotes,
		activity: profile.activity,
	} satisfies Partial<PreferencesState>;
}

export const usePreferencesStore = create<PreferencesState>()(
	persist(
		(set, get) => {
			/**
			 * Apply a pure update to the active user's profile, writing
			 * both the profile map and the projected top-level fields.
			 *
			 * This collapses ~12 nearly-identical action bodies into a single
			 * shared shape:
			 *
			 *   mutate(state, current => ({ ...current, ... }))
			 */
			function mutate(updater: (profile: PreferencesProfile) => PreferencesProfile) {
				set((state) => {
					const userScopeId = resolveUserScopeId(state.userScopeId);
					const current = normalizeProfile(state.profiles[userScopeId]);
					const next = updater(current);
					return {
						profiles: { ...state.profiles, [userScopeId]: next },
						...projectProfile(userScopeId, next),
					};
				});
			}

			return {
				userScopeId: null,
				isLoading: true,
				isHydrated: false,
				profiles: {},
				...createDefaultProfile(),

				initialize: () => {
					get().syncUserScope(getUserScopeId());
				},

				syncUserScope: (userScopeId) => {
					set((state) => {
						const profile = applyAuthEditorPreferences(
							normalizeProfile(state.profiles[userScopeId]),
						);
						return {
							profiles: state.profiles[userScopeId]
								? state.profiles
								: { ...state.profiles, [userScopeId]: profile },
							...projectProfile(userScopeId, profile),
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

					if (key === "animateNumbers") {
						void updateUserEditorPreferences({
							animateNumbers: value as PreferencesProfile["editor"]["animateNumbers"],
						});
					}
				},

				updateAppearancePreference: (key, value) => {
					const commit = () =>
						mutate((profile) => ({
							...profile,
							appearance: { ...profile.appearance, [key]: value },
						}));

					if (key === "theme") {
						if (typeof document !== "undefined") {
							document.documentElement.dataset.themeSwitching = "true";
						}
						startTransition(commit);
						return;
					}

					commit();
				},

				updateProfilePreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						profile: { ...profile.profile, [key]: value },
					}));
				},

				updatePrivacyPreference: (key, value) => {
					if (key === "analyticsEnabled" && getUserScopeId() === SIGNED_OUT_USER_SCOPE) {
						return;
					}

					mutate((profile) => ({
						...profile,
						privacy: { ...profile.privacy, [key]: value },
					}));
					if (key === "analyticsEnabled") {
						if (value === false) {
							optOut();
							return;
						}
						optIn();
					}
				},

				updateAiPreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						ai: { ...profile.ai, [key]: value },
					}));
				},

				updateQuickAccessPreference: (key, value) => {
					mutate((profile) => ({
						...profile,
						quickAccess: { ...profile.quickAccess, [key]: value },
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
								([userScopeId, profile]) => [
									userScopeId,
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
					state.isLoading = state.userScopeId === null;
				}
			},
		},
	),
);

// The tag-derivation regex runs deep inside pure domain code (note-links,
// rich-document) where no React context is reachable, so the preference is
// mirrored into a module-level flag instead of threaded through every caller.
setTagDetectionEnabled(usePreferencesStore.getState().editor.detectTagsInText);
setMarkDetectionEnabled(usePreferencesStore.getState().editor.detectMarksInText);
usePreferencesStore.subscribe((state) => {
	setTagDetectionEnabled(state.editor.detectTagsInText);
	setMarkDetectionEnabled(state.editor.detectMarksInText);
});
