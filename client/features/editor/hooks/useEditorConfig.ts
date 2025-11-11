import { useMemo } from "react";
import { useSettings, useUserPreferences } from "@/shared/data/settings";

/**
 * Hook for configuring BlockNote editor based on user settings
 */
export function useEditorConfig() {
  const { fontSize, fontFamily, lineHeight, maxWidth } = useSettings();
  const { hasWordWrap, hasSpellCheck, hasMarkdownShortcuts, hasAutoComplete } = useUserPreferences();

  const editorConfig = useMemo(() => {
    return {
      // Editor appearance settings
      theme: 'dark', // Could be controlled by hasDarkMode preference
      editorProps: {
        attributes: {
          class: 'prose prose-lg max-w-none focus:outline-none',
          style: {
            fontSize: getFontSizePx(fontSize),
            fontFamily: getFontFamily(fontFamily),
            lineHeight: lineHeight.toString(),
            maxWidth: getMaxWidthPx(maxWidth),
            wordWrap: hasWordWrap ? 'break-word' : 'normal',
          },
        },
      },

      // Editor behavior settings
      autoFocus: true,
      placeholder: 'Start typing your note...',

      // Feature toggles based on user preferences
      spellCheck: hasSpellCheck,
      enableInputRules: hasMarkdownShortcuts,
      enablePasteRules: hasAutoComplete,
      enableSlashCommands: hasAutoComplete,

      // Toolbar configuration
      toolbar: {
        shouldShow: true,
        // You could add preferences for toolbar items here
      },

      // Side menu configuration
      sideMenu: {
        shouldShow: true,
      },

      // Formatting options
      formattingToolbar: {
        shouldShow: true,
      },
    };
  }, [
    fontSize,
    fontFamily,
    lineHeight,
    maxWidth,
    hasWordWrap,
    hasSpellCheck,
    hasMarkdownShortcuts,
    hasAutoComplete,
  ]);

  return {
    config: editorConfig,
    hasWordWrap,
    hasSpellCheck,
    hasMarkdownShortcuts,
    hasAutoComplete,
  };
}

/**
 * Helper functions for converting settings to CSS values
 */
function getFontSizePx(size: string): string {
  const sizeMap: Record<string, string> = {
    small: '14px',
    medium: '16px',
    large: '18px',
    'x-large': '20px',
  };
  return sizeMap[size] || '16px';
}

function getFontFamily(family: string): string {
  const fontMap: Record<string, string> = {
    inter: '"Inter", system-ui, sans-serif',
    mono: '"Fira Code", "Menlo", "Monaco", monospace',
    serif: '"Georgia", "Times New Roman", serif',
    'sans-serif': 'system-ui, sans-serif',
  };
  return fontMap[family] || '"Inter", system-ui, sans-serif';
}

function getMaxWidthPx(width: string): string {
  const widthMap: Record<string, string> = {
    narrow: '65ch',
    medium: '75ch',
    wide: '85ch',
    full: 'none',
  };
  return widthMap[width] || 'none';
}