import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getUserEditorPreferences,
  getWorkspaceId,
  resolveWorkspaceId,
  updateUserEditorPreferences,
} from "@/platform/auth";
import { DEFAULT_AI_MODEL, isAiModelId } from "@/features/ai/constants";
import { isEditorFontId, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
  isEditorLineHeight,
  type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";

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
  defaultFont: EditorFontId;
  lineHeight: EditorLineHeight;
  spellcheck: boolean;
  smartPunctuation: boolean;
  markdownShortcuts: boolean;
}

interface AppearancePreferences {
  theme: "midnight" | "graphite" | "paper";
  accentColor: string;
  compactSidebar: boolean;
  showLineNumbers: boolean;
  reduceMotion: boolean;
}

interface NotificationsPreferences {
  dailyReminder: boolean;
  weeklyReview: boolean;
  mentions: boolean;
  emailSummaries: boolean;
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
  appearance: AppearancePreferences;
  notifications: NotificationsPreferences;
  profile: ProfilePreferences;
  journal: JournalPreferences;
  ai: AiPreferences;
  amountOfNotes: number;
  activity: ActivityItem[];
};

type PersistedPreferencesProfile = {
  editor?: Partial<EditorPreferences>;
  appearance?: Partial<AppearancePreferences>;
  notifications?: Partial<NotificationsPreferences>;
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
  defaultFont: "inter",
  lineHeight: "comfortable",
  spellcheck: true,
  smartPunctuation: true,
  markdownShortcuts: true,
};

const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  theme: "midnight",
  accentColor: "#a78bfa",
  compactSidebar: false,
  showLineNumbers: true,
  reduceMotion: false,
};

const DEFAULT_NOTIFICATIONS_PREFERENCES: NotificationsPreferences = {
  dailyReminder: true,
  weeklyReview: false,
  mentions: true,
  emailSummaries: false,
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
    appearance: { ...DEFAULT_APPEARANCE_PREFERENCES },
    notifications: { ...DEFAULT_NOTIFICATIONS_PREFERENCES },
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
      defaultFont:
        typeof profile?.editor?.defaultFont === "string" &&
        isEditorFontId(profile.editor.defaultFont)
          ? profile.editor.defaultFont
          : fallback.editor.defaultFont,
      lineHeight:
        typeof profile?.editor?.lineHeight === "string" &&
        isEditorLineHeight(profile.editor.lineHeight)
          ? profile.editor.lineHeight
          : fallback.editor.lineHeight,
      spellcheck:
        typeof profile?.editor?.spellcheck === "boolean"
          ? profile.editor.spellcheck
          : fallback.editor.spellcheck,
      smartPunctuation:
        typeof profile?.editor?.smartPunctuation === "boolean"
          ? profile.editor.smartPunctuation
          : fallback.editor.smartPunctuation,
      markdownShortcuts:
        typeof profile?.editor?.markdownShortcuts === "boolean"
          ? profile.editor.markdownShortcuts
          : fallback.editor.markdownShortcuts,
    },
    appearance: {
      theme:
        (["midnight", "graphite", "paper"] as const).includes(
          profile?.appearance?.theme as AppearancePreferences["theme"],
        )
          ? (profile!.appearance!.theme as AppearancePreferences["theme"])
          : fallback.appearance.theme,
      accentColor:
        typeof profile?.appearance?.accentColor === "string"
          ? profile.appearance.accentColor
          : fallback.appearance.accentColor,
      compactSidebar:
        typeof profile?.appearance?.compactSidebar === "boolean"
          ? profile.appearance.compactSidebar
          : fallback.appearance.compactSidebar,
      showLineNumbers:
        typeof profile?.appearance?.showLineNumbers === "boolean"
          ? profile.appearance.showLineNumbers
          : fallback.appearance.showLineNumbers,
      reduceMotion:
        typeof profile?.appearance?.reduceMotion === "boolean"
          ? profile.appearance.reduceMotion
          : fallback.appearance.reduceMotion,
    },
    notifications: {
      dailyReminder:
        typeof profile?.notifications?.dailyReminder === "boolean"
          ? profile.notifications.dailyReminder
          : fallback.notifications.dailyReminder,
      weeklyReview:
        typeof profile?.notifications?.weeklyReview === "boolean"
          ? profile.notifications.weeklyReview
          : fallback.notifications.weeklyReview,
      mentions:
        typeof profile?.notifications?.mentions === "boolean"
          ? profile.notifications.mentions
          : fallback.notifications.mentions,
      emailSummaries:
        typeof profile?.notifications?.emailSummaries === "boolean"
          ? profile.notifications.emailSummaries
          : fallback.notifications.emailSummaries,
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
        typeof rawAi?.model === "string" && isAiModelId(rawAi.model)
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
    appearance: profile.appearance,
    notifications: profile.notifications,
    profile: profile.profile,
    journal: profile.journal,
    ai: profile.ai,
    amountOfNotes: profile.amountOfNotes,
    activity: profile.activity,
  } satisfies Partial<PreferencesState>;
}

function applyAuthEditorPreferences(profile: PreferencesProfile): PreferencesProfile {
  const authPreferences = getUserEditorPreferences();
  if (!authPreferences?.defaultFont) {
    return profile;
  }

  return {
    ...profile,
    editor: {
      ...profile.editor,
      defaultFont: authPreferences.defaultFont,
    },
  };
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

      updateAppearancePreference: (key, value) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            appearance: { ...currentProfile.appearance, [key]: value },
          };
          return {
            profiles: { ...state.profiles, [workspaceId]: nextProfile },
            ...applyProfile(workspaceId, nextProfile),
          };
        });
      },

      updateNotificationsPreference: (key, value) => {
        set((state) => {
          const workspaceId = resolveWorkspaceId(state.workspaceId);
          const currentProfile = normalizeProfile(state.profiles[workspaceId]);
          const nextProfile: PreferencesProfile = {
            ...currentProfile,
            notifications: { ...currentProfile.notifications, [key]: value },
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

        if (key === "defaultFont") {
          void updateUserEditorPreferences({ defaultFont: value as PreferencesProfile["editor"]["defaultFont"] });
        }
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
          const profile = applyAuthEditorPreferences(normalizeProfile(state.profiles[workspaceId]));

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
