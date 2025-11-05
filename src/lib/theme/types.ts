/**
 * Theme type definitions
 *
 * Extensible theme system that supports:
 * - 'light': Light theme
 * - 'dark': Dark theme
 * - 'system': Follows OS preference
 * - Future themes can be added here
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Available theme options
 * Extend this array when adding new themes
 */
export const THEMES: Theme[] = ['light', 'dark', 'system'];

/**
 * Theme display names
 * Add display names for new themes here
 */
export const THEME_NAMES: Record<Theme, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
};

/**
 * Get the effective theme based on current theme preference and system preference
 */
export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'system') {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'dark'; // Default to dark for SSR
    }
    return theme;
}


