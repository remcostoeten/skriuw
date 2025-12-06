import { codeBlockOptions } from '@blocknote/code-block'
import { BlockNoteSchema, createCodeBlockSpec } from '@blocknote/core'
import { customCodeBlockSpec } from '../blocks/custom-code-block'
import { useMemo } from 'react'

import { createPasteHandler } from '@/features/editor/utils/markdown-paste-handler'
import { useSettings, useUserPreferences } from '@/features/settings'

import { taskBlockSpec } from '../slash-menu/task-block'
import { animatedNumberBlockSpec } from '../slash-menu/animated-number-block'
import { shadcnTableBlockSpec } from '../slash-menu/shadcn-table-block'
import { fileTreeBlockSpec } from '../slash-menu/file-tree-block'
import { calloutBlockSpec } from '../blocks/callout-block'
import '@/features/editor/utils/prism-file-tree'

/**
 * Creates a BlockNote schema with syntax highlighting enabled for code blocks
 * and custom task blocks
 */
export function createEditorSchema() {
	return BlockNoteSchema.create().extend({
		blockSpecs: {
			codeBlock: customCodeBlockSpec(),
			task: taskBlockSpec(), // createReactBlockSpec returns a function that needs to be called
			'animated-number': animatedNumberBlockSpec(),
			shadcnTable: shadcnTableBlockSpec(), // Add our new block custom block
			fileTree: fileTreeBlockSpec(),
			callout: calloutBlockSpec(),
		},
	})
}

/**
 * Hook for configuring BlockNote editor based on user settings
 */
export function useEditorConfig() {
	const { hasWordWrap, hasSpellCheck, hasMarkdownShortcuts } = useUserPreferences()
	const { settings } = useSettings()

	const fontSize = settings.fontSize || 'medium'
	const fontFamily = settings.fontFamily || 'inter'
	const lineHeight = settings.lineHeight || 1.6
	const maxWidth = settings.maxWidth || 'full'

	const editorConfig = useMemo(() => {
		// Create schema with syntax highlighting enabled for code blocks
		const schema = createEditorSchema()

		const config: Record<string, any> = {
			schema,
			theme: 'dark' as const,
			editorProps: {
				attributes: {
					class: 'prose prose-lg max-w-none focus:outline-none',
					style: {
						fontSize: getFontSizePx(fontSize),
						fontFamily: getFontFamily(fontFamily),
						lineHeight: lineHeight.toString(),
						maxWidth: getMaxWidthPx(maxWidth),
						wordWrap: hasWordWrap ? 'break-word' : 'normal',
						whiteSpace: hasWordWrap ? 'pre-wrap' : 'pre',
					},
					spellcheck: hasSpellCheck ? 'true' : 'false',
				},
				// Editor behavior settings
				autoFocus: false,
				enableInputRules: hasMarkdownShortcuts,
				enablePasteRules: hasMarkdownShortcuts,
				enableSlashCommands: true, // Always enable slash commands regardless of markdown shortcuts

				// Custom paste handler for markdown/MDX content
				// Uses BlockNote's official pasteHandler API
				// See: https://www.blocknotejs.org/docs/reference/editor/paste-handling
				pasteHandler: createPasteHandler(),
			},
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
		settings,
	])

	return {
		config: editorConfig,
		hasWordWrap,
		hasSpellCheck,
		hasMarkdownShortcuts,
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
		'x-large': '20px',
	}
	return sizeMap[size] || '16px'
}

function getFontFamily(family: string): string {
	const fontMap: Record<string, string> = {
		inter: '"Inter", system-ui, sans-serif',
		mono: '"Fira Code", "Menlo", "Monaco", monospace',
		serif: '"Georgia", "Times New Roman", serif',
		'sans-serif': 'system-ui, sans-serif',
	}
	return fontMap[family] || '"Inter", system-ui, sans-serif'
}

function getMaxWidthPx(width: string): string {
	const widthMap: Record<string, string> = {
		narrow: '65ch',
		medium: '75ch',
		wide: '85ch',
		full: 'none',
	}
	return widthMap[width] || 'none'
}
