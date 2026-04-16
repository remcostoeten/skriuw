import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getWorkspaceId } from "@/platform/auth";

type ActivityAction =
  | "settings_opened"
  | "note_created"
  | "mode_changed"
  | "diary_toggled";

type ActivityItem = {
  id: string;
  action: ActivityAction;
  createdAt: Date;
};

interface EditorPreferences {
  defaultModeRaw: boolean;
  defaultPlaceholder: string;
}

interface ProfilePreferences {
  avatarColor: string | null;
}

interface JournalPreferences {
  diaryModeEnabled: boolean;
  recentMoods: Array<{ mood: string; date: Date }>;
}

type PreferencesProfile = {
  editor: EditorPreferences;
  profile: ProfilePreferences;
  journal: JournalPreferences;
  amountOfNotes: number;
  activity: ActivityItem[];
};

type PersistedPreferencesProfile = {
  editor?: Partial<EditorPreferences>;
  profile?: Partial<ProfilePreferences>;
  journal?: Partial<JournalPreferences>;
  amountOfNotes?: number;
  activity?: Array<Partial<ActivityItem>>;
};

interface PreferencesState {
  workspaceId: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  profiles: Record<string, PreferencesProfile>;
  editor: EditorPreferences;
  profile: ProfilePreferences;
  journal: JournalPreferences;
  amountOfNotes: number;
  activity: ActivityItem[];
  initialize: () => void;
  updateEditorPreference: <K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K],
  ) => void;
  updateProfilePreference: <K extends keyof ProfilePreferences>(
    key: K,
    value: ProfilePreferences[K],
  ) => void;
  toggleDiaryMode: () => void;
  recordMood: (mood: string) => void;
  incrementNoteCount: () => void;
  logActivity: (action: ActivityAction) => void;
  syncWorkspace: (workspaceId: string) => void;
}

type PersistedPreferencesState = {
  userId?: string | null;
  profiles?: Record<string, PersistedPreferencesProfile>;
  editor?: Partial<EditorPreferences>;
  profile?: Partial<ProfilePreferences>;
  journal?: Partial<JournalPreferences>;
  amountOfNotes?: number;
  activity?: Array<Partial<ActivityItem>>;
};

const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  defaultModeRaw: false,
  defaultPlaceholder: "Start writing...",
};

const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  avatarColor: null,
};

const DEFAULT_JOURNAL_PREFERENCES: JournalPreferences = {
  diaryModeEnabled: false,
  recentMoods: [],
};

function createDefaultProfile(): PreferencesProfile {
  return {
    editor: { ...DEFAULT_EDITOR_PREFERENCES },
    profile: { ...DEFAULT_PROFILE_PREFERENCES },
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
    profile: {
      avatarColor:
        typeof profile?.profile?.avatarColor === "string" || profile?.profile?.avatarColor === null
          ? (profile?.profile?.avatarColor ?? fallback.profile.avatarColor)
          : fallback.profile.avatarColor,
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

function applyProfile(workspaceId: string, profile: PreferencesProfile) {
  return {
    workspaceId,
    isLoading: false,
    editor: profile.editor,
    profile: profile.profile,
    journal: profile.journal,
    amountOfNotes: profile.amountOfNotes,
    activity: profile.activity,
  } satisfies Partial<PreferencesState>;
}

function resolveWorkspaceId(workspaceId: string | null | undefined): string {
  return workspaceId ?? getWorkspaceId();
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      workspaceId: null,
      isLoading: true,
      isHydrated: false,
      profiles: {},
      ...createDefaultProfile(),

      initialize: () => {
        const workspaceId = getWorkspaceId();
        get().syncWorkspace(workspaceId);
      },

      updateEditorPreference: (key, value) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
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
              [workspaceId]: nextProfile,
            },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      updateProfilePreference: (key, value) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            profile: {
              ...currentProfile.profile,
              [key]: value,
            },
          };

          return {
            profiles: {
              ...state.profiles,
              [workspaceId]: nextProfile,
            },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      toggleDiaryMode: () => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
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
              [workspaceId]: nextProfile,
            },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      recordMood: (mood) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
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
              [workspaceId]: nextProfile,
            },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      incrementNoteCount: () => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
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
              [workspaceId]: nextProfile,
            },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      logActivity: (action) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
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
              [workspaceId]: nextProfile,
            },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      syncWorkspace: (workspaceId) => {
        set((state) => {
          const profile = normalizeProfile(state.profiles[workspaceId]);

          return {
            profiles: state.profiles[workspaceId]
              ? state.profiles
              : {
                  ...state.profiles,
                  [workspaceId]: profile,
                },
            ...applyProfile(workspaceId, profile),
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
              Object.entries(typedPersisted.profiles).map(([workspaceId, profile]) => [
                workspaceId,
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
          state.isLoading = state.workspaceId === null;
        }
      },
    },
  ),
);
