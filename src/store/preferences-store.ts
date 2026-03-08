import { create } from "zustand";
import { persist } from "zustand/middleware";
import { requireUser } from "@/modules/auth";

// --- Types ---

export type TemplateStyle = "simple" | "notion" | "journal";

export type ActivityAction =
  | "settings_opened"
  | "note_created"
  | "template_changed"
  | "mode_changed"
  | "diary_toggled";

export type ActivityItem = {
  id: string;
  action: ActivityAction;
  createdAt: Date;
};

export type TemplateTimestamp = {
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
};

export type TemplatePreview = {
  id: TemplateStyle;
  name: string;
  description: string;
  preview: string;
};

export const TEMPLATE_OPTIONS: TemplatePreview[] = [
  {
    id: "simple",
    name: "Simple Title",
    description: "Uses the document title as the first line. Minimal layout.",
    preview: `# My Note Title\n\nStart writing here...`,
  },
  {
    id: "notion",
    name: "Notion Style",
    description: "Title with inline metadata including timestamps.",
    preview: `# My Note Title\ncreated: 2026-03-06\nupdated: 2026-03-06\n\nStart writing here...`,
  },
  {
    id: "journal",
    name: "Journal",
    description: "Daily journaling with mood tracking and reusable tags.",
    preview: `# Thursday, March 6, 2026\n\nmood: neutral\ntags: #reflection #gratitude\n\n---\n\n*9:30 AM*\n\nYour entry here...`,
  },
];

// --- Store ---

function createInitialTimestamp(): TemplateTimestamp {
  const now = new Date();
  return { createdAt: now, updatedAt: now, lastUsedAt: null, useCount: 0 };
}

interface EditorPreferences {
  defaultModeMarkdown: boolean;
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

  // Templates
  templateStyle: TemplateStyle;
  templateTimestamps: Record<TemplateStyle, TemplateTimestamp>;

  // Journal
  journal: JournalPreferences;

  // Stats
  amountOfNotes: number;
  activity: ActivityItem[];

  // Actions
  initialize: () => void;
  updateEditorPreference: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
  updateTemplateStyle: (style: TemplateStyle) => void;
  recordTemplateUsage: (style: TemplateStyle) => void;
  toggleDiaryMode: () => void;
  recordMood: (mood: string) => void;
  incrementNoteCount: () => void;
  logActivity: (action: ActivityAction) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      userId: null,
      isLoading: true,
      isHydrated: false,

      editor: {
        defaultModeMarkdown: true,
        defaultPlaceholder: "Start writing...",
      },

      templateStyle: "simple",
      templateTimestamps: {
        simple: createInitialTimestamp(),
        notion: createInitialTimestamp(),
        journal: createInitialTimestamp(),
      },

      journal: {
        diaryModeEnabled: false,
        recentMoods: [],
      },

      amountOfNotes: 0,
      activity: [],

      // Actions
      initialize: () => {
        const user = requireUser();
        const { userId } = get();

        if (!userId || userId !== user.id) {
          set({ userId: user.id, isLoading: false });
        } else {
          set({ isLoading: false });
        }
      },

      updateEditorPreference: (key, value) => {
        set((state) => ({
          editor: { ...state.editor, [key]: value },
        }));
      },

      updateTemplateStyle: (style) => {
        const now = new Date();
        set((state) => {
          const timestamps = { ...state.templateTimestamps };
          timestamps[style] = timestamps[style]
            ? { ...timestamps[style], updatedAt: now }
            : createInitialTimestamp();

          return { templateStyle: style, templateTimestamps: timestamps };
        });
        get().logActivity("template_changed");
      },

      recordTemplateUsage: (style) => {
        const now = new Date();
        set((state) => {
          const timestamps = { ...state.templateTimestamps };
          const current = timestamps[style] || createInitialTimestamp();
          timestamps[style] = {
            ...current,
            lastUsedAt: now,
            useCount: (current.useCount || 0) + 1,
          };
          return { templateTimestamps: timestamps };
        });
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
    }),
    {
      name: "preferences-store",
      partialize: (state) => ({
        userId: state.userId,
        editor: state.editor,
        templateStyle: state.templateStyle,
        templateTimestamps: state.templateTimestamps,
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
