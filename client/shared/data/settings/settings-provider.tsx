import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getStorage } from "@/shared/storage";
import type { SettingsConfig, FeatureFlag } from "../types";

interface SettingsContextValue {
  settings: Record<string, any>;
  featureFlags: Record<string, boolean>;
  updateSetting: (key: string, value: any) => void;
  updateFeatureFlag: (key: string, enabled: boolean) => void;
  resetSettings: () => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
  defaultSettings?: Record<string, any>;
  defaultFeatureFlags?: Record<string, boolean>;
}

const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontSize: 'medium',
  autoSave: true,
  autoSaveInterval: 30000, // 30 seconds
  sidebarWidth: 280,
  showLineNumbers: false,
  wordWrap: true,
  spellCheck: true,
  autoBackup: false,
  backupInterval: 3600000, // 1 hour
  maxBackupFiles: 10,
  disableResponsive: false, // Dev tool to disable responsive behavior
} as const;

const DEFAULT_FEATURE_FLAGS = {
  realTimeCollaboration: false,
  advancedSearch: true,
  exportToPDF: true,
  markdownShortcuts: true,
  folderOrganization: true,
  tagsAndCategories: false,
  templates: false,
  darkMode: true,
  keyboardShortcuts: true,
  autoSaveIndicator: true,
  notePreview: true,
} as const;

export function SettingsProvider({
  children,
  defaultSettings = DEFAULT_SETTINGS,
  defaultFeatureFlags = DEFAULT_FEATURE_FLAGS,
}: SettingsProviderProps) {
  const [settings, setSettings] = useState<Record<string, any>>(defaultSettings);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>(defaultFeatureFlags);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettingsAndFlags();
  }, []);

  const loadSettingsAndFlags = async () => {
    try {
      const storage = getStorage();

      // Try to load settings from storage
      const settingsItem = await storage.findItemById('app-settings');
      if (settingsItem && settingsItem.type === 'note') {
        const parsedSettings = JSON.parse(settingsItem.content[0]?.content?.[0]?.text || '{}');
        setSettings({ ...defaultSettings, ...parsedSettings });
      }

      // Try to load feature flags from storage
      const flagsItem = await storage.findItemById('feature-flags');
      if (flagsItem && flagsItem.type === 'note') {
        const parsedFlags = JSON.parse(flagsItem.content[0]?.content?.[0]?.text || '{}');
        setFeatureFlags({ ...defaultFeatureFlags, ...parsedFlags });
      }

      // Check environment variables for feature flags
      const envFlags = loadEnvironmentFlags();
      setFeatureFlags(prev => ({ ...prev, ...envFlags }));

    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEnvironmentFlags = (): Record<string, boolean> => {
    const flags: Record<string, boolean> = {};

    // Load feature flags from environment variables
    // Format: VITE_FF_FEATURE_NAME=true
    if (typeof window !== 'undefined' && window.import_meta_env) {
      Object.entries(window.import_meta_env).forEach(([key, value]) => {
        if (key.startsWith('VITE_FF_')) {
          const flagKey = key.replace('VITE_FF_', '').toLowerCase();
          flags[flagKey] = value === 'true';
        }
      });
    }

    return flags;
  };

  const saveSettingsToStorage = async (newSettings: Record<string, any>) => {
    try {
      const storage = getStorage();

      const settingsContent = [{
        id: "1",
        type: "paragraph" as const,
        props: {},
        content: [{
          type: "text" as const,
          text: JSON.stringify(newSettings),
          styles: {},
        }],
        children: [],
      }];

      await storage.updateNote('app-settings', settingsContent);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const saveFeatureFlagsToStorage = async (newFlags: Record<string, boolean>) => {
    try {
      const storage = getStorage();

      const flagsContent = [{
        id: "1",
        type: "paragraph" as const,
        props: {},
        content: [{
          type: "text" as const,
          text: JSON.stringify(newFlags),
          styles: {},
        }],
        children: [],
      }];

      await storage.updateNote('feature-flags', flagsContent);
    } catch (error) {
      console.error('Failed to save feature flags:', error);
    }
  };

  const updateSetting = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettingsToStorage(newSettings);
  };

  const updateFeatureFlag = (key: string, enabled: boolean) => {
    const newFlags = { ...featureFlags, [key]: enabled };
    setFeatureFlags(newFlags);
    saveFeatureFlagsToStorage(newFlags);
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    setFeatureFlags(defaultFeatureFlags);
    saveSettingsToStorage(defaultSettings);
    saveFeatureFlagsToStorage(defaultFeatureFlags);
  };

  const value: SettingsContextValue = {
    settings,
    featureFlags,
    updateSetting,
    updateFeatureFlag,
    resetSettings,
    isLoading,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
}