import { calloutBlockSpec } from '../blocks/callout-block'
import { customCodeBlockSpec } from '../blocks/custom-code-block'
import { headerBlockSpec } from '../blocks/header-block'
import { fileTreeBlockSpec } from '../slash-menu/file-tree-block'
import { shadcnTableBlockSpec } from '../slash-menu/shadcn-table-block'
import { taskBlockSpec } from '../slash-menu/task-block'
import { createPasteHandler } from '@/features/editor/utils/markdown-paste-handler'
import { useSettings, useUserPreferences } from '@/features/settings'
import { BlockNoteSchema } from '@blocknote/core'
import { useMemo } from 'react'
import { WikiLink } from '../inline-content/wikilink-content'
import { TagInline } from '../inline-content/tag-mention-content'

/**
 * Creates a BlockNote schema with syntax highlighting enabled for code blocks
 * and custom task blocks
 */
export function createEditorSchema() {
	return BlockNoteSchema.create().extend({
		blockSpecs: {
			codeBlock: customCodeBlockSpec(),
			task: taskBlockSpec(), // createReactBlockSpec returns a function that needs to be called

			shadcnTable: shadcnTableBlockSpec(), // Add our new block custom block
			fileTree: fileTreeBlockSpec(),
			callout: calloutBlockSpec(),
			header: headerBlockSpec()
		},
		inlineContentSpecs: {
			wikilink: WikiLink,
			tag: TagInline
		}
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
	const lineHeight = settings.lineHeight || 1.4
	const maxWidth = settings.maxWidth || 'full'

	const editorConfig = useMemo(() => {
		// Create schema with syntax highlighting enabled for code blocks
		const schema = createEditorSchema()

		const config: Record<string, any> = {
			schema,
			theme: 'dark' as const,
			// Add placeholder text configuration
			placeholders: {
				default: settings.bodyPlaceholder || 'Enter text or type / for commands',
				heading: 'Heading',
				bulletListItem: 'List item',
				numberedListItem: 'List item',
				checkListItem: 'To-do'
			},
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
				},
				// Editor behavior settings
				autoFocus: false,
				enableInputRules: hasMarkdownShortcuts,
				enablePasteRules: hasMarkdownShortcuts,
				enableSlashCommands: true, // Always enable slash commands regardless of markdown shortcuts

				// Custom paste handler for markdown/MDX content
				// Uses BlockNote's official pasteHandler API
				// See: https://www.blocknotejs.org/docs/reference/editor/paste-handling
				pasteHandler: createPasteHandler()
			}
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
		settings
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
