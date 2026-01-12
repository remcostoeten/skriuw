'use client'

import React, { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Monaco } from '@monaco-editor/react'
import type { PreviewProps } from '../types'
import { EDITOR_THEMES, type EditorTheme } from '../../editor/components/raw-mdx-editor'

// Dynamically import Monaco for preview - even smaller footprint
const MonacoEditor = dynamic(
    () => import('@monaco-editor/react').then((mod) => mod.default),
    { ssr: false }
)

// Sample code to show in the preview
const SAMPLE_CODE = `# Hello World

This is **markdown** with \`code\`.

\`\`\`javascript
const greeting = "Hello!";

\`\`\``

// Define all custom themes in Monaco
function defineAllThemes(monaco: Monaco) {
    Object.entries(EDITOR_THEMES).forEach(([themeName, themeConfig]) => {
        if (Object.keys(themeConfig.colors).length > 0) {
            monaco.editor.defineTheme(themeName, {
                base: themeConfig.base,
                inherit: true,
                rules: [],
                colors: themeConfig.colors,
            })
        }
    })
}

export default function EditorThemePreview({ value }: PreviewProps<EditorTheme>) {
    const [isReady, setIsReady] = useState(false)
    const monacoRef = useRef<Monaco | null>(null)
    const theme = value || 'skriuw-dark'
    const themeConfig = EDITOR_THEMES[theme]

    function handleEditorDidMount(_editor: any, monaco: Monaco) {
        monacoRef.current = monaco
        defineAllThemes(monaco)

        // Apply the selected theme
        if (themeConfig && Object.keys(themeConfig.colors).length > 0) {
            monaco.editor.setTheme(theme)
        } else if (themeConfig) {
            monaco.editor.setTheme(themeConfig.base)
        }

        setIsReady(true)
    }

    // Update theme when value changes
    useEffect(() => {
        if (monacoRef.current && isReady) {
            const config = EDITOR_THEMES[theme]
            if (config) {
                if (Object.keys(config.colors).length === 0) {
                    monacoRef.current.editor.setTheme(config.base)
                } else {
                    monacoRef.current.editor.setTheme(theme)
                }
            }
        }
    }, [theme, isReady])

    return (
        <div className="mt-3 rounded-md overflow-hidden border border-border">
            <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span>Preview</span>
                <span className="font-medium">{themeConfig?.label || theme}</span>
            </div>
            <div
                className={`transition-opacity duration-200 ${isReady ? 'opacity-100' : 'opacity-0'}`}
                style={{ height: '120px' }}
            >
                <MonacoEditor
                    height="120px"
                    defaultLanguage="markdown"
                    value={SAMPLE_CODE}
                    theme="vs-dark"
                    onMount={handleEditorDidMount}
                    loading={null}
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'off',
                        folding: false,
                        fontSize: 12,
                        lineHeight: 18,
                        padding: { top: 8, bottom: 8 },
                        scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        renderLineHighlight: 'none',
                        contextmenu: false,
                        domReadOnly: true,
                    }}
                />
            </div>
        </div>
    )
}
