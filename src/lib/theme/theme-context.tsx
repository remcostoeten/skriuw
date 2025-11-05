'use client';

import { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { useUserSetting } from '@/hooks/use-user-setting';
import { Theme, getEffectiveTheme } from './types';

interface ThemeContextValue {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Theme Provider Component
 *
 * Manages theme state, persists to userSettings, and applies theme to document.
 *
 * Usage:
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeSetting, isLoading] = useUserSetting<Theme>('theme', 'dark');
  const effectiveTheme = useMemo(() => getEffectiveTheme(theme), [theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Remove all theme classes
    root.classList.remove('light', 'dark');
    body.classList.remove('light', 'dark');

    // Apply effective theme
    const appliedTheme = effectiveTheme;
    root.classList.add(appliedTheme);
    body.classList.add(appliedTheme);
  }, [effectiveTheme]);

  // Listen for system theme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Trigger re-render by updating a state or forcing a re-evaluation
      // The effectiveTheme memo will handle the rest
      const root = document.documentElement;
      const body = document.body;
      root.classList.remove('light', 'dark');
      body.classList.remove('light', 'dark');
      const newEffectiveTheme = getEffectiveTheme(theme);
      root.classList.add(newEffectiveTheme);
      body.classList.add(newEffectiveTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback(
    async (newTheme: Theme) => {
      await setThemeSetting(newTheme);
    },
    [setThemeSetting]
  );

  const value = useMemo(
    () => ({
      theme,
      effectiveTheme,
      setTheme,
      isLoading,
    }),
    [theme, effectiveTheme, setTheme, isLoading]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access theme context
 *
 * @example
 * ```tsx
 * const { theme, setTheme, effectiveTheme } = useTheme();
 * ```
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}


