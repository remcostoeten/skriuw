import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAuthActorId } from "@/platform/auth";

// --- Types ---

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

interface PreferencesState {
  userId: string | null;
  isLoading: boolean;
  isHydrated: boolean;

  // Editor
  editor: EditorPreferences;

  // Journal
  journal: JournalPreferences;

  // Stats
  amountOfNotes: number;
  activity: ActivityItem[];

  // Actions
  initialize: () => void;
  updateEditorPreference: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
  toggleDiaryMode: () => void;
  recordMood: (mood: string) => void;
  incrementNoteCount: () => void;
  logActivity: (action: ActivityAction) => void;
  syncActor: (actorId: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      userId: null,
      isLoading: true,
      isHydrated: false,

      editor: {
        defaultModeRaw: false,
        defaultPlaceholder: "Start writing...",
      },

      journal: {
        diaryModeEnabled: false,
        recentMoods: [],
      },

      amountOfNotes: 0,
      activity: [],

      // Actions
      initialize: () => {
        const actorId = getAuthActorId();
        const { userId } = get();

        if (!userId || userId !== actorId) {
          set({ userId: actorId, isLoading: false });
        } else {
          set({ isLoading: false });
        }
      },

      updateEditorPreference: (key, value) => {
        set((state) => ({
          editor: { ...state.editor, [key]: value },
        }));
      },


      toggleDiaryMode: () => {
        set((state) => ({
          journal: {
            ...state.journal,
            diaryModeEnabled: !state.journal.diaryModeEnabled,
          },
        }));
        get().logActivity("diary_toggled");
      },

      recordMood: (mood) => {
        set((state) => ({
          journal: {
            ...state.journal,
            recentMoods: [
              { mood, date: new Date() },
              ...state.journal.recentMoods,
            ].slice(0, 30),
          },
        }));
      },

      incrementNoteCount: () => {
        set((state) => ({ amountOfNotes: state.amountOfNotes + 1 }));
        get().logActivity("note_created");
      },

      logActivity: (action) => {
        set((state) => ({
          activity: [
            { id: crypto.randomUUID(), action, createdAt: new Date() },
            ...state.activity,
          ].slice(0, 50),
        }));
      },

      syncActor: (actorId) => {
        set((state) => (state.userId === actorId ? state : { userId: actorId }));
      },
    }),
    {
      name: "preferences-store",
      partialize: (state) => ({
        userId: state.userId,
        editor: state.editor,
        journal: state.journal,
        amountOfNotes: state.amountOfNotes,
        activity: state.activity,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
          state.isLoading = false;
        }
      },
    },
  ),
);
