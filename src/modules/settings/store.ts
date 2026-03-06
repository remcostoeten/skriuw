import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { requireUser } from '@/modules/auth';
import { 
  UserSettings, 
  TemplateStyle, 
  ActivityItem, 
  ActivityAction,
  TemplateTimestamp,
  SavedTag,
  TAG_COLORS,
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
  getSavedTags: () => SavedTag[];
  getTagByName: (name: string) => SavedTag | undefined;
  
  // Mutations
  initializeSettings: () => void;
  updateTemplateStyle: (style: TemplateStyle) => void;
  updateDefaultMode: (isMarkdown: boolean) => void;
  updatePlaceholder: (placeholder: string) => void;
  toggleDiaryMode: () => void;
  incrementNoteCount: () => void;
  recordTemplateUsage: (style: TemplateStyle) => void;
  logActivity: (action: ActivityAction) => void;
  
  // Tag management
  addTag: (name: string, color?: string) => SavedTag;
  removeTag: (id: string) => void;
  updateTagUsage: (tagId: string) => void;
  recordMood: (mood: string) => void;
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

      getSavedTags: () => {
        const { settings } = get();
        return settings?.savedTags || [];
      },

      getTagByName: (name: string) => {
        const { settings } = get();
        return settings?.savedTags.find(t => t.name.toLowerCase() === name.toLowerCase());
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

      addTag: (name: string, color?: string) => {
        const { settings } = get();
        if (!settings) {
          // Return a temporary tag if settings not initialized
          return {
            id: crypto.randomUUID(),
            name,
            color: color || TAG_COLORS[0].value,
            usageCount: 0,
            lastUsedAt: null,
            createdAt: new Date(),
          };
        }
        
        // Check if tag already exists
        const existing = settings.savedTags.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing;
        
        const newTag: SavedTag = {
          id: crypto.randomUUID(),
          name: name.toLowerCase(),
          color: color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)].value,
          usageCount: 1,
          lastUsedAt: new Date(),
          createdAt: new Date(),
        };
        
        set({
          settings: {
            ...settings,
            savedTags: [...settings.savedTags, newTag],
          },
        });
        
        return newTag;
      },

      removeTag: (id: string) => {
        const { settings } = get();
        if (!settings) return;
        
        set({
          settings: {
            ...settings,
            savedTags: settings.savedTags.filter(t => t.id !== id),
          },
        });
      },

      updateTagUsage: (tagId: string) => {
        const { settings } = get();
        if (!settings) return;
        
        set({
          settings: {
            ...settings,
            savedTags: settings.savedTags.map(t =>
              t.id === tagId
                ? { ...t, usageCount: t.usageCount + 1, lastUsedAt: new Date() }
                : t
            ),
          },
        });
      },

      recordMood: (mood: string) => {
        const { settings } = get();
        if (!settings) return;
        
        const newMood = { mood, date: new Date() };
        
        set({
          settings: {
            ...settings,
            recentMoods: [newMood, ...settings.recentMoods].slice(0, 30), // Keep last 30 moods
          },
        });
      },
    }),
    {
      name: 'haptic-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
