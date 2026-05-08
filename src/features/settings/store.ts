import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getWorkspaceId, resolveWorkspaceId } from "@/platform/auth";
import { DEFAULT_AI_MODEL } from "@/features/ai/constants";

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

export interface AiKey {
  id: string;
  name: string;
  apiKey: string;
  tested: boolean;
}

export interface AiPreferences {
  model: string;
  keys: AiKey[];
  activeKeyId: string | null;
}

type PreferencesProfile = {
  editor: EditorPreferences;
  profile: ProfilePreferences;
  journal: JournalPreferences;
  ai: AiPreferences;
  amountOfNotes: number;
  activity: ActivityItem[];
};

type PersistedPreferencesProfile = {
  editor?: Partial<EditorPreferences>;
  profile?: Partial<ProfilePreferences>;
  journal?: Partial<JournalPreferences>;
  ai?: Partial<AiPreferences>;
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
  ai: AiPreferences;
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
  updateAiPreference: <K extends keyof AiPreferences>(
    key: K,
    value: AiPreferences[K],
  ) => void;
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

const DEFAULT_AI_PREFERENCES: AiPreferences = {
  model: DEFAULT_AI_MODEL,
  keys: [],
  activeKeyId: null,
};

function createDefaultProfile(): PreferencesProfile {
  return {
    editor: { ...DEFAULT_EDITOR_PREFERENCES },
    profile: { ...DEFAULT_PROFILE_PREFERENCES },
    journal: { ...DEFAULT_JOURNAL_PREFERENCES, recentMoods: [] },
    ai: { ...DEFAULT_AI_PREFERENCES },
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
    ai: (() => {
      const rawAi = profile?.ai as Record<string, unknown> | undefined;
      const model =
        typeof rawAi?.model === "string" && rawAi.model.length > 0
          ? rawAi.model
          : fallback.ai.model;

      // Migrate legacy single apiKey → keys array
      if (!Array.isArray(rawAi?.keys) && typeof rawAi?.apiKey === "string" && rawAi.apiKey) {
        const migratedKey: AiKey = {
          id: "migrated-key",
          name: "Default",
          apiKey: rawAi.apiKey as string,
          tested: true,
        };
        return { model, keys: [migratedKey], activeKeyId: "migrated-key" };
      }

      const keys: AiKey[] = Array.isArray(rawAi?.keys)
        ? (rawAi.keys as unknown[])
            .filter(
              (k): k is AiKey =>
                typeof (k as AiKey)?.id === "string" &&
                typeof (k as AiKey)?.apiKey === "string" &&
                typeof (k as AiKey)?.name === "string",
            )
            .map((k) => ({ ...k, tested: Boolean(k.tested) }))
        : [];

      const activeKeyId =
        typeof rawAi?.activeKeyId === "string" && keys.some((k) => k.id === rawAi.activeKeyId)
          ? (rawAi.activeKeyId as string)
          : (keys[0]?.id ?? null);

      return { model, keys, activeKeyId };
    })(),
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
    ai: profile.ai,
    amountOfNotes: profile.amountOfNotes,
    activity: profile.activity,
  } satisfies Partial<PreferencesState>;
}


export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      workspaceId: null,
      isLoading: true,
      isHydrated: false,
      profiles: {},
      ...createDefaultProfile(),

      updateAiPreference: (key, value) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            ai: { ...currentProfile.ai, [key]: value },
          };
          return {
            profiles: { ...state.profiles, [workspaceId]: nextProfile },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      addAiKey: (key) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const keys = [...currentProfile.ai.keys, key];
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            ai: {
              ...currentProfile.ai,
              keys,
              activeKeyId: currentProfile.ai.activeKeyId ?? key.id,
            },
          };
          return {
            profiles: { ...state.profiles, [workspaceId]: nextProfile },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      removeAiKey: (id) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const keys = currentProfile.ai.keys.filter((k) => k.id !== id);
          const activeKeyId =
            currentProfile.ai.activeKeyId === id ? (keys[0]?.id ?? null) : currentProfile.ai.activeKeyId;
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            ai: { ...currentProfile.ai, keys, activeKeyId },
          };
          return {
            profiles: { ...state.profiles, [workspaceId]: nextProfile },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      setActiveAiKey: (id) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            ai: { ...currentProfile.ai, activeKeyId: id },
          };
          return {
            profiles: { ...state.profiles, [workspaceId]: nextProfile },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      markAiKeyTested: (id) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const keys = currentProfile.ai.keys.map((k) =>
            k.id === id ? { ...k, tested: true } : k,
          );
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            ai: { ...currentProfile.ai, keys },
          };
          return {
            profiles: { ...state.profiles, [workspaceId]: nextProfile },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

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
