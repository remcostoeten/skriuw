import React, { useCallback, useMemo } from "react";

import { useSettingsContext } from "./settings-provider";

import type { UserSetting } from "@/shared/data/types";

/**
 * Hook for accessing and managing user preferences
 * This is focused on user-controlled preferences, not development feature flags
 */
export function useUserPreferences() {
  const { settings, updateSetting } = useSettingsContext();

  const isEnabled = useCallback((key: string): boolean => {
    return Boolean(settings[key]);
  }, [settings]);

  const enable = useCallback((key: string) => {
    updateSetting(key, true);
  }, [updateSetting]);

  const disable = useCallback((key: string) => {
    updateSetting(key, false);
  }, [updateSetting]);

  const toggle = useCallback((key: string) => {
    updateSetting(key, !settings[key]);
  }, [settings, updateSetting]);

  const setPreference = useCallback((key: string, enabled: boolean) => {
    updateSetting(key, enabled);
  }, [updateSetting]);

  // Get all user preferences with their definitions
  const activePreferences = useMemo(() => {
    const preferences: UserSetting[] = [];

    // Common user preferences (settings that can be toggled)
    const commonPreferences: Record<string, Omit<UserSetting, 'key'>> = {
      autoSave: {
        value: settings.autoSave !== false, // default true
        defaultValue: true,
        type: 'boolean',
        description: "Automatically save notes while typing",
        category: 'behavior',
      },
      wordWrap: {
        value: settings.wordWrap !== false, // default true
        defaultValue: true,
        type: 'boolean',
        description: "Enable word wrapping in the editor",
        category: 'editor',
      },
      spellCheck: {
        value: settings.spellCheck !== false, // default true
        defaultValue: true,
        type: 'boolean',
        description: "Enable spell checking",
        category: 'editor',
      },
      showLineNumbers: {
        value: settings.showLineNumbers || false,
        defaultValue: false,
        type: 'boolean',
        description: "Show line numbers in the editor",
        category: 'editor',
      },
      markdownShortcuts: {
        value: settings.markdownShortcuts !== false, // default true
        defaultValue: true,
        type: 'boolean',
        description: "Enable markdown keyboard shortcuts",
        category: 'editor',
      },
      previewPanel: {
        value: settings.previewPanel !== false, // default true
        defaultValue: true,
        type: 'boolean',
        description: "Show preview panel for markdown",
        category: 'appearance',
      },
      focusMode: {
        value: settings.focusMode || false,
        defaultValue: false,
        type: 'boolean',
        description: "Enable focus mode (distraction-free writing)",
        category: 'editor',
      },
      darkMode: {
        value: settings.darkMode !== false, // default true
        defaultValue: true,
        type: 'boolean',
        description: "Use dark mode theme",
        category: 'appearance',
      },
      autoBackup: {
        value: settings.autoBackup || false,
        defaultValue: false,
        type: 'boolean',
        description: "Automatically backup notes",
        category: 'backup',
      },
    };

    Object.entries(commonPreferences).forEach(([key, pref]) => {
      preferences.push({
        key,
        ...pref,
      });
    });

    return preferences.filter(pref => pref.value);
  }, [settings]);

  // Convenience hooks for common preferences
  const hasAutoSave = isEnabled('autoSave');
  const hasWordWrap = isEnabled('wordWrap');
  const hasSpellCheck = isEnabled('spellCheck');
  const hasShowLineNumbers = isEnabled('showLineNumbers');
  const hasMarkdownShortcuts = isEnabled('markdownShortcuts');
  const hasPreviewPanel = isEnabled('previewPanel');
  const hasFocusMode = isEnabled('focusMode');
  const hasDarkMode = isEnabled('darkMode');
  const hasAutoBackup = isEnabled('autoBackup');

  return {
    // Raw access
    settings,
    isEnabled,
    enable,
    disable,
    toggle,
    setPreference,

    // Active preferences
    activePreferences,

    // Convenience preferences
    hasAutoSave,
    hasWordWrap,
    hasSpellCheck,
    hasShowLineNumbers,
    hasMarkdownShortcuts,
    hasPreviewPanel,
    hasFocusMode,
    hasDarkMode,
    hasAutoBackup,
  };
}

/**
 * Hook for conditionally rendering based on user preferences
 */
export function useUserPreference(preferenceKey: string, fallback?: React.ReactNode) {
  const { isEnabled } = useUserPreferences();

  return {
    isEnabled: isEnabled(preferenceKey),
    shouldRender: isEnabled(preferenceKey),
    fallback,
  };
}

/**
 * Higher-order component for user preference gating
 */
export function withUserPreference<P extends object>(
  preferenceKey: string,
  Component: React.ComponentType<P>,
  Fallback?: React.ComponentType | React.ReactNode
) {
  return function UserPreferenceWrapper(props: P) {
    const { isEnabled, shouldRender } = useUserPreference(preferenceKey);

    if (!shouldRender) {
      if (React.isValidElement(Fallback)) {
        return Fallback;
      }
      if (typeof Fallback === 'function') {
        const FallbackComponent = Fallback as React.ComponentType;
        return <FallbackComponent />;
      }
      return null;
    }

    return <Component { ...props } />;
  };
}