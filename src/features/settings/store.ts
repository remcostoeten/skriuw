import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getAuthActorId } from "@/platform/auth";

export type ActivityAction =
  | "settings_opened"
  | "note_created"
  | "mode_changed"
  | "diary_toggled";

export type ActivityItem = {
  id: string;
  action: ActivityAction;
  createdAt: Date;
};

interface EditorPreferences {
  defaultModeRaw: boolean;
  defaultPlaceholder: string;
}

interface JournalPreferences {
  diaryModeEnabled: boolean;
  recentMoods: Array<{ mood: string; date: Date }>;
}

type PreferencesProfile = {
  editor: EditorPreferences;
  journal: JournalPreferences;
  amountOfNotes: number;
  activity: ActivityItem[];
};

type PersistedPreferencesProfile = {
  editor?: Partial<EditorPreferences>;
  journal?: Partial<JournalPreferences>;
  amountOfNotes?: number;
  activity?: Array<Partial<ActivityItem>>;
};

interface PreferencesState {
  userId: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  profiles: Record<string, PreferencesProfile>;
  editor: EditorPreferences;
  journal: JournalPreferences;
  amountOfNotes: number;
  activity: ActivityItem[];
  initialize: () => void;
  updateEditorPreference: <K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K],
  ) => void;
  toggleDiaryMode: () => void;
  recordMood: (mood: string) => void;
  incrementNoteCount: () => void;
  logActivity: (action: ActivityAction) => void;
  syncActor: (actorId: string) => void;
}

type PersistedPreferencesState = {
  userId?: string | null;
  profiles?: Record<string, PersistedPreferencesProfile>;
  editor?: Partial<EditorPreferences>;
  journal?: Partial<JournalPreferences>;
  amountOfNotes?: number;
  activity?: Array<Partial<ActivityItem>>;
};

const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  defaultModeRaw: false,
  defaultPlaceholder: "Start writing...",
};

const DEFAULT_JOURNAL_PREFERENCES: JournalPreferences = {
  diaryModeEnabled: false,
  recentMoods: [],
};

function createDefaultProfile(): PreferencesProfile {
  return {
    editor: { ...DEFAULT_EDITOR_PREFERENCES },
    journal: { ...DEFAULT_JOURNAL_PREFERENCES, recentMoods: [] },
    amountOfNotes: 0,
    activity: [],
  };
}

function toDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return fallback;
}

function normalizeProfile(profile: PersistedPreferencesProfile | undefined): PreferencesProfile {
  const fallback = createDefaultProfile();

  return {
    editor: {
      defaultModeRaw:
        typeof profile?.editor?.defaultModeRaw === "boolean"
          ? profile.editor.defaultModeRaw
          : fallback.editor.defaultModeRaw,
      defaultPlaceholder:
        typeof profile?.editor?.defaultPlaceholder === "string"
          ? profile.editor.defaultPlaceholder
          : fallback.editor.defaultPlaceholder,
    },
    journal: {
      diaryModeEnabled:
        typeof profile?.journal?.diaryModeEnabled === "boolean"
          ? profile.journal.diaryModeEnabled
          : fallback.journal.diaryModeEnabled,
      recentMoods: Array.isArray(profile?.journal?.recentMoods)
        ? profile.journal.recentMoods
            .map((item) => ({
              mood: typeof item?.mood === "string" ? item.mood : "",
              date: toDate(item?.date),
            }))
            .filter((item) => item.mood.length > 0)
            .slice(0, 30)
        : fallback.journal.recentMoods,
    },
    amountOfNotes:
      typeof profile?.amountOfNotes === "number" && Number.isFinite(profile.amountOfNotes)
        ? profile.amountOfNotes
        : fallback.amountOfNotes,
    activity: Array.isArray(profile?.activity)
      ? profile.activity
          .map((item) => ({
            id: typeof item?.id === "string" ? item.id : crypto.randomUUID(),
            action: (item?.action as ActivityAction | undefined) ?? "settings_opened",
            createdAt: toDate(item?.createdAt),
          }))
          .slice(0, 50)
      : fallback.activity,
  };
}

function createActivityItem(action: ActivityAction): ActivityItem {
  return {
    id: crypto.randomUUID(),
    action,
    createdAt: new Date(),
  };
}

function applyProfile(actorId: string, profile: PreferencesProfile) {
  return {
    userId: actorId,
    isLoading: false,
    editor: profile.editor,
    journal: profile.journal,
    amountOfNotes: profile.amountOfNotes,
    activity: profile.activity,
  } satisfies Partial<PreferencesState>;
}

function resolveActorId(userId: string | null | undefined): string {
  return userId ?? getAuthActorId();
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      userId: null,
      isLoading: true,
      isHydrated: false,
      profiles: {},
      ...createDefaultProfile(),

      initialize: () => {
        const actorId = getAuthActorId();
        get().syncActor(actorId);
      },

      updateEditorPreference: (key, value) => {
        set((state) => {
          const actorId = resolveActorId(state.userId);
          const currentProfile = normalizeProfile(state.profiles[actorId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            editor: {
              ...currentProfile.editor,
              [key]: value,
            },
          };

          return {
            profiles: {
              ...state.profiles,
              [actorId]: nextProfile,
            },
            ...applyProfile(actorId, nextProfile),
          };
        });
      },

      toggleDiaryMode: () => {
        set((state) => {
          const actorId = resolveActorId(state.userId);
          const currentProfile = normalizeProfile(state.profiles[actorId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            journal: {
              ...currentProfile.journal,
              diaryModeEnabled: !currentProfile.journal.diaryModeEnabled,
            },
            activity: [
              createActivityItem("diary_toggled"),
              ...currentProfile.activity,
            ].slice(0, 50),
          };

          return {
            profiles: {
              ...state.profiles,
              [actorId]: nextProfile,
            },
            ...applyProfile(actorId, nextProfile),
          };
        });
      },

      recordMood: (mood) => {
        set((state) => {
          const actorId = resolveActorId(state.userId);
          const currentProfile = normalizeProfile(state.profiles[actorId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            journal: {
              ...currentProfile.journal,
              recentMoods: [
                { mood, date: new Date() },
                ...currentProfile.journal.recentMoods,
              ].slice(0, 30),
            },
          };

          return {
            profiles: {
              ...state.profiles,
              [actorId]: nextProfile,
            },
            ...applyProfile(actorId, nextProfile),
          };
        });
      },

      incrementNoteCount: () => {
        set((state) => {
          const actorId = resolveActorId(state.userId);
          const currentProfile = normalizeProfile(state.profiles[actorId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            amountOfNotes: currentProfile.amountOfNotes + 1,
            activity: [
              createActivityItem("note_created"),
              ...currentProfile.activity,
            ].slice(0, 50),
          };

          return {
            profiles: {
              ...state.profiles,
              [actorId]: nextProfile,
            },
            ...applyProfile(actorId, nextProfile),
          };
        });
      },

      logActivity: (action) => {
        set((state) => {
          const actorId = resolveActorId(state.userId);
          const currentProfile = normalizeProfile(state.profiles[actorId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            activity: [
              createActivityItem(action),
              ...currentProfile.activity,
            ].slice(0, 50),
          };

          return {
            profiles: {
              ...state.profiles,
              [actorId]: nextProfile,
            },
            ...applyProfile(actorId, nextProfile),
          };
        });
      },

      syncActor: (actorId) => {
        set((state) => {
          const profile = normalizeProfile(state.profiles[actorId]);

          return {
            profiles: state.profiles[actorId]
              ? state.profiles
              : {
                  ...state.profiles,
                  [actorId]: profile,
                },
            ...applyProfile(actorId, profile),
          };
        });
      },
    }),
    {
      name: "preferences-store",
      storage: createJSONStorage(() => globalThis.localStorage),
      partialize: (state) => ({
        profiles: state.profiles,
      }),
      merge: (persistedState, currentState) => {
        const typedPersisted = (persistedState ?? {}) as PersistedPreferencesState;

        if (typedPersisted.profiles) {
          return {
            ...currentState,
            profiles: Object.fromEntries(
              Object.entries(typedPersisted.profiles).map(([actorId, profile]) => [
                actorId,
                normalizeProfile(profile),
              ]),
            ),
          };
        }

        const hasLegacyState =
          typedPersisted.userId !== undefined ||
          typedPersisted.editor !== undefined ||
          typedPersisted.journal !== undefined ||
          typedPersisted.amountOfNotes !== undefined ||
          typedPersisted.activity !== undefined;

        if (!hasLegacyState) {
          return currentState;
        }

        if (!typedPersisted.userId) {
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
          state.isLoading = state.userId === null;
        }
      },
    },
  ),
);
