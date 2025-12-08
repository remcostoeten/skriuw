'use client'

import React, { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { OnMount, Monaco } from '@monaco-editor/react'
import { cn } from '@skriuw/core-logic'
import { useSettingsContext } from '../../settings/settings-provider'

// Dynamically import Monaco - no SSR, loads only when needed
const MonacoEditor = dynamic(
	() => import('@monaco-editor/react').then((mod) => mod.default),
	{ ssr: false }
)

interface RawMDXEditorProps {
	value: string
	onChange: (value: string) => void
	className?: string
	disabled?: boolean
	autoFocus?: boolean
	wordWrap?: boolean
	fontSize?: string
	fontFamily?: string
	lineHeight?: number
	spellCheck?: boolean
}

// Available editor themes - minimal bundle impact (~1KB total for all definitions)
export const EDITOR_THEMES = {
	'skriuw-dark': {
		label: 'Skriuw Dark',
		base: 'vs-dark' as const,
		colors: {
			'editor.background': '#161616',
			'editor.lineHighlightBackground': '#1e1e1e',
			'editorLineNumber.foreground': '#555555',
			'editorLineNumber.activeForeground': '#888888',
		},
	},
	'github-dark': {
		label: 'GitHub Dark',
		base: 'vs-dark' as const,
		colors: {
			'editor.background': '#0d1117',
			'editor.lineHighlightBackground': '#161b22',
			'editorLineNumber.foreground': '#484f58',
			'editorLineNumber.activeForeground': '#7d8590',
		},
	},
	'dracula': {
		label: 'Dracula',
		base: 'vs-dark' as const,
		colors: {
			'editor.background': '#282a36',
			'editor.lineHighlightBackground': '#44475a',
			'editorLineNumber.foreground': '#6272a4',
			'editorLineNumber.activeForeground': '#f8f8f2',
		},
	},
	'one-dark': {
		label: 'One Dark',
		base: 'vs-dark' as const,
		colors: {
			'editor.background': '#282c34',
			'editor.lineHighlightBackground': '#2c313c',
			'editorLineNumber.foreground': '#495162',
			'editorLineNumber.activeForeground': '#abb2bf',
		},
	},
	'monokai': {
		label: 'Monokai',
		base: 'vs-dark' as const,
		colors: {
			'editor.background': '#272822',
			'editor.lineHighlightBackground': '#3e3d32',
			'editorLineNumber.foreground': '#90908a',
			'editorLineNumber.activeForeground': '#c2c2bf',
		},
	},
	'vs-dark': {
		label: 'VS Code Dark',
		base: 'vs-dark' as const,
		colors: {}, // Use Monaco's built-in vs-dark
	},
	'vs-light': {
		label: 'VS Code Light',
		base: 'vs' as const,
		colors: {},
	},
} as const

export type EditorTheme = keyof typeof EDITOR_THEMES

// Define all custom themes in Monaco
const defineAllThemes = (monaco: Monaco) => {
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

/**
 * Raw MDX Editor component
 * Uses Monaco Editor for full syntax highlighting and LSP support
 */
export function RawMDXEditor({
	value,
	onChange,
	className,
	disabled = false,
	autoFocus = false,
	wordWrap = true,
	fontSize = '14px',
	fontFamily = '"Fira Code", "Menlo", "Monaco", monospace',
	lineHeight = 1.6,
}: RawMDXEditorProps) {
	const [isReady, setIsReady] = useState(false)
	const monacoRef = useRef<Monaco | null>(null)
	const { settings } = useSettingsContext()

	// Get theme from user settings, default to skriuw-dark
	const editorTheme = (settings.editorTheme as EditorTheme) || 'skriuw-dark'

	const handleChange = (val: string | undefined) => {
		onChange(val ?? '')
	}

	const handleEditorDidMount: OnMount = (editor, monaco) => {
		monacoRef.current = monaco

		// Define all custom themes
		defineAllThemes(monaco)

		// Apply user's selected theme
		const themeConfig = EDITOR_THEMES[editorTheme]
		if (themeConfig) {
			// For built-in themes, use the base directly
			if (Object.keys(themeConfig.colors).length === 0) {
				monaco.editor.setTheme(themeConfig.base)
			} else {
				monaco.editor.setTheme(editorTheme)
			}
		}

		if (autoFocus) {
			editor.focus()
		}

		requestAnimationFrame(() => {
			setIsReady(true)
		})
	}

	// Update theme when user changes it in settings
	useEffect(() => {
		if (monacoRef.current && isReady) {
			const themeConfig = EDITOR_THEMES[editorTheme]
			if (themeConfig) {
				if (Object.keys(themeConfig.colors).length === 0) {
					monacoRef.current.editor.setTheme(themeConfig.base)
				} else {
					monacoRef.current.editor.setTheme(editorTheme)
				}
			}
		}
	}, [editorTheme, isReady])

	return (
		<div
			className={cn(
				'relative w-full h-[calc(100vh-200px)] bg-background-secondary',
				disabled && 'opacity-50 pointer-events-none',
				className
			)}
			role="textbox"
			aria-label="MDX Editor"
			aria-multiline="true"
			aria-readonly={disabled}
		>
			<div
				className={cn(
					'w-full h-full transition-opacity duration-200',
					isReady ? 'opacity-100' : 'opacity-0'
				)}
			>
				<MonacoEditor
					height="100%"
					defaultLanguage="markdown"
					value={value}
					onChange={handleChange}
					onMount={handleEditorDidMount}
					theme="vs-dark"
					loading={null}
					options={{
						readOnly: disabled,
						fontFamily,
						fontSize: parseInt(fontSize, 10) || 14,
						lineHeight: lineHeight * (parseInt(fontSize, 10) || 14),
						wordWrap: wordWrap ? 'on' : 'off',
						minimap: { enabled: false },
						scrollBeyondLastLine: false,
						automaticLayout: true,
						padding: { top: 0, bottom: 0 },
						lineNumbers: 'on',
						renderLineHighlight: 'line',
						cursorBlinking: 'smooth',
						cursorSmoothCaretAnimation: 'on',
						smoothScrolling: true,
						tabSize: 2,
						insertSpaces: true,
						bracketPairColorization: { enabled: true },
						overviewRulerLanes: 0,
						hideCursorInOverviewRuler: true,
						scrollbar: {
							vertical: 'auto',
							horizontal: 'auto',
							verticalScrollbarSize: 8,
							horizontalScrollbarSize: 8,
						},
						accessibilitySupport: 'on',
						ariaLabel: 'MDX Code Editor',
					}}
				/>
			</div>

			{isReady && (
				<div
					className="absolute bottom-4 right-4 text-xs text-muted-foreground pointer-events-none bg-background/80 backdrop-blur-sm px-2 py-1 rounded border border-border z-10"
					aria-hidden="true"
				>
					MDX Mode
				</div>
			)}
		</div>
	)
}
