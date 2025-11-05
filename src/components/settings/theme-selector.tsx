'use client';

import { useTheme } from '@/lib/theme';
import { THEMES, THEME_NAMES, type Theme } from '@/lib/theme/types';
import { Monitor, Moon, Sun } from 'lucide-react';

/**
 * Theme Selector Component
 *
 * A reusable component for selecting themes in settings UI.
 * Can be used in the settings dialog or anywhere theme selection is needed.
 */
export function ThemeSelector() {
  const { theme, setTheme, isLoading } = useTheme();

  const themeIcons: Record<Theme, React.ReactNode> = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Theme</label>
      <div className="flex gap-2">
        {THEMES.map((themeOption) => (
          <button
            key={themeOption}
            onClick={() => setTheme(themeOption)}
            disabled={isLoading}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md border transition-colors
              ${
                theme === themeOption
                  ? 'bg-accent text-accent-foreground border-primary'
                  : 'bg-background hover:bg-accent/50 border-border'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={THEME_NAMES[themeOption]}
          >
            {themeIcons[themeOption]}
            <span className="text-sm">{THEME_NAMES[themeOption]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


