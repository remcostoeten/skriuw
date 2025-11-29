import { useMemo } from 'react'

import { createPasteHandler } from '@/features/editor/utils/markdown-paste-handler'
import { useSettings, useUserPreferences } from '@/features/settings'

/**
 * Hook for configuring BlockNote editor based on user settings
 */
export function useEditorConfig() {
    const { placeholder } = useSettings()
    const { hasWordWrap, hasSpellCheck, hasMarkdownShortcuts } =
        useUserPreferences()

    const fontSize = 'medium'
    const fontFamily = 'inter'
    const lineHeight = 1.6
    const maxWidth = 'full'

    const editorConfig = useMemo(() => {
        const config: Record<string, any> = {
            theme: 'dark',
            editorProps: {
                attributes: {
                    class: 'prose prose-lg max-w-none focus:outline-none',
                    style: {
                        fontSize: getFontSizePx(fontSize),
                        fontFamily: getFontFamily(fontFamily),
                        lineHeight: lineHeight.toString(),
                        maxWidth: getMaxWidthPx(maxWidth),
                        wordWrap: hasWordWrap ? 'break-word' : 'normal',
                        whiteSpace: hasWordWrap ? 'pre-wrap' : 'pre'
                    },
                    spellcheck: hasSpellCheck ? 'true' : 'false'
                }
            },

            // Editor behavior settings
            autoFocus: false,
            placeholder: placeholder ?? 'Start typing your note...',
            enableInputRules: hasMarkdownShortcuts,
            enablePasteRules: hasMarkdownShortcuts,
            enableSlashCommands: true, // Always enable slash commands regardless of markdown shortcuts

            // Custom paste handler for markdown/MDX content
            // Uses BlockNote's official pasteHandler API
            // See: https://www.blocknotejs.org/docs/reference/editor/paste-handling
            pasteHandler: createPasteHandler()
        }

        // Enable suggestion menus (slash commands) by default
        config.suggestionMenus = true

        return config
    }, [
        fontFamily,
        fontSize,
        hasMarkdownShortcuts,
        hasSpellCheck,
        hasWordWrap,
        lineHeight,
        maxWidth,
        placeholder
    ])

    return {
        config: editorConfig,
        hasWordWrap,
        hasSpellCheck,
        hasMarkdownShortcuts
    }
}

/**
 * Helper functions for converting settings to CSS values
 */
function getFontSizePx(size: string): string {
    const sizeMap: Record<string, string> = {
        small: '14px',
        medium: '16px',
        large: '18px',
        'x-large': '20px'
    }
    return sizeMap[size] || '16px'
}

function getFontFamily(family: string): string {
    const fontMap: Record<string, string> = {
        inter: '"Inter", system-ui, sans-serif',
        mono: '"Fira Code", "Menlo", "Monaco", monospace',
        serif: '"Georgia", "Times New Roman", serif',
        'sans-serif': 'system-ui, sans-serif'
    }
    return fontMap[family] || '"Inter", system-ui, sans-serif'
}

function getMaxWidthPx(width: string): string {
    const widthMap: Record<string, string> = {
        narrow: '65ch',
        medium: '75ch',
        wide: '85ch',
        full: 'none'
    }
    return widthMap[width] || 'none'
}
