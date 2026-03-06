import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { requireUser } from '@/modules/auth';
import { 
  UserSettings, 
  TemplateStyle, 
  ActivityItem, 
  ActivityAction,
  TemplateTimestamp,
  DEFAULT_SETTINGS 
} from './types';

// Helper to create initial timestamp
function createInitialTimestamp(): TemplateTimestamp {
  const now = new Date();
  return {
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    useCount: 0,
  };
}

type SettingsState = {
  settings: UserSettings | null;
  isLoading: boolean;
  
  // Queries
  getSettings: () => UserSettings;
  getTemplateTimestamp: (style: TemplateStyle) => TemplateTimestamp;
  
  // Mutations
  initializeSettings: () => void;
  updateTemplateStyle: (style: TemplateStyle) => void;
  updateDefaultMode: (isMarkdown: boolean) => void;
  updatePlaceholder: (placeholder: string) => void;
  toggleDiaryMode: () => void;
  incrementNoteCount: () => void;
  recordTemplateUsage: (style: TemplateStyle) => void;
  logActivity: (action: ActivityAction) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: null,
      isLoading: true,

      getSettings: () => {
        const { settings } = get();
        if (!settings) {
          const user = requireUser();
          const newSettings: UserSettings = {
            ...DEFAULT_SETTINGS,
            userId: user.id,
          };
          set({ settings: newSettings, isLoading: false });
          return newSettings;
        }
        return settings;
      },

      getTemplateTimestamp: (style: TemplateStyle) => {
        const { settings } = get();
        if (!settings) {
          return createInitialTimestamp();
        }
        
        if (!settings.templateTimestamps[style]) {
          return createInitialTimestamp();
        }
        
        return settings.templateTimestamps[style];
      },

      initializeSettings: () => {
        const user = requireUser();
        const { settings } = get();
        
        if (!settings || settings.userId !== user.id) {
          set({
            settings: {
              ...DEFAULT_SETTINGS,
              userId: user.id,
            },
            isLoading: false,
          });
        } else {
          set({ isLoading: false });
        }
      },

      updateTemplateStyle: (style: TemplateStyle) => {
        const { settings, logActivity } = get();
        if (!settings) return;
        
        // Update timestamp for selected template
        const now = new Date();
        const templateTimestamps = { ...settings.templateTimestamps };
        
        if (!templateTimestamps[style]) {
          templateTimestamps[style] = createInitialTimestamp();
        } else {
          templateTimestamps[style] = {
            ...templateTimestamps[style],
            updatedAt: now,
          };
        }
        
        set({
          settings: {
            ...settings,
            templateStyle: style,
            templateTimestamps,
          },
        });
        logActivity('template_changed');
      },

      updateDefaultMode: (isMarkdown: boolean) => {
        const { settings, logActivity } = get();
        if (!settings) return;
        
        set({
          settings: {
            ...settings,
            defaultModeMarkdown: isMarkdown,
          },
        });
        logActivity('mode_changed');
      },

      updatePlaceholder: (placeholder: string) => {
        const { settings } = get();
        if (!settings) return;
        
        set({
          settings: {
            ...settings,
            defaultPlaceholder: placeholder,
          },
        });
      },

      toggleDiaryMode: () => {
        const { settings, logActivity } = get();
        if (!settings) return;
        
        set({
          settings: {
            ...settings,
            diaryModeEnabled: !settings.diaryModeEnabled,
          },
        });
        logActivity('diary_toggled');
      },

      incrementNoteCount: () => {
        const { settings, logActivity } = get();
        if (!settings) return;
        
        set({
          settings: {
            ...settings,
            amountOfNotes: settings.amountOfNotes + 1,
          },
        });
        logActivity('note_created');
      },

      recordTemplateUsage: (style: TemplateStyle) => {
        const { settings } = get();
        if (!settings) return;
        
        const now = new Date();
        const templateTimestamps = { ...settings.templateTimestamps };
        
        if (!templateTimestamps[style]) {
          templateTimestamps[style] = createInitialTimestamp();
        }
        
        templateTimestamps[style] = {
          ...templateTimestamps[style],
          lastUsedAt: now,
          useCount: (templateTimestamps[style].useCount || 0) + 1,
        };
        
        set({
          settings: {
            ...settings,
            templateTimestamps,
          },
        });
      },

      logActivity: (action: ActivityAction) => {
        const { settings } = get();
        if (!settings) return;
        
        const newActivity: ActivityItem = {
          id: crypto.randomUUID(),
          action,
          createdAt: new Date(),
        };
        
        set({
          settings: {
            ...settings,
            activity: [newActivity, ...settings.activity].slice(0, 50), // Keep last 50 activities
          },
        });
      },
    }),
    {
      name: 'theme-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
