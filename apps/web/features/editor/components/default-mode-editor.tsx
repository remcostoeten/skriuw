import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Block } from '@blocknote/core'
import { RawMDXEditor } from './raw-mdx-editor'
import { useUserPreferences } from '../../settings/use-feature-flags'
import { markdownToBlocks } from '../../notes/utils/markdown-to-blocks'
import { blocksToMarkdown } from '../../notes/utils/blocks-to-markdown'
import { BlockNoteView } from './blocknote-shadcn/BlockNoteView'
import { NoteMentionSuggestionMenu } from './note-suggestions-menu'
import { SlashSuggestionMenu } from './slash-suggestions-menu'
import { cn } from '@skriuw/core-logic'

interface DualModeEditorProps {
	editor: any // BlockNoteEditor instance
	value: Block[]
	onChange: (blocks: Block[]) => void
	disabled?: boolean
	fontSize?: string
	fontFamily?: string
	lineHeight?: number
	wordWrap?: boolean
	blockIndicator?: boolean
	showFormattingToolbar?: boolean
	className?: string
}

/**
 * Dual-mode editor that supports both rich BlockNote editing and raw MDX editing
 * Users can switch between modes using the toolbar button or Ctrl+M shortcut
 */
export function DualModeEditor({
	editor,
	value,
	onChange,

	disabled = false,
	fontSize = '16px',
	fontFamily = '"Inter", system-ui, sans-serif',
	lineHeight = 1.6,
	wordWrap = true,
	blockIndicator = true,
	showFormattingToolbar = true,
	className,
}: DualModeEditorProps) {
	const { hasRawMDXMode, hasSideBySideMode, toggle: togglePreference } = useUserPreferences()
	const [rawMDXContent, setRawMDXContent] = useState('')
	const [isConverting, setIsConverting] = useState(false)
	const [splitRatio, setSplitRatio] = useState(50) // Percentage for left panel (0-100)
	const splitterRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const isDraggingRef = useRef(false)

	// Convert BlockNote blocks to raw markdown when switching to MDX mode
	const convertBlocksToMDX = useCallback(async (blocks: Block[]) => {
		setIsConverting(true)
		try {
			const markdown = blocksToMarkdown(blocks)
			setRawMDXContent(markdown)
			return markdown
		} catch (error) {
			console.error('Failed to convert blocks to markdown:', error)
			// Fallback to plain text extraction
			const plainText = blocks
				.map((block) => (block.content ? String(block.content) : ''))
				.join('\n')
			setRawMDXContent(plainText)
			return plainText
		} finally {
			setIsConverting(false)
		}
	}, [])

	// Convert raw markdown to BlockNote blocks when switching back to rich mode
	const convertMDXToBlocks = useCallback(
		async (markdown: string) => {
			setIsConverting(true)
			try {
				const blocks = await markdownToBlocks(markdown)
				onChange(blocks)
				return blocks
			} catch (error) {
				console.error('Failed to convert markdown to blocks:', error)
				// Fallback to creating a simple paragraph block
				const fallbackBlock = {
					id: 'fallback-' + Date.now(),
					type: 'paragraph' as const,
					props: {
						backgroundColor: 'default',
						textColor: 'default',
						textAlignment: 'left',
					},
					content: [
						{
							type: 'text' as const,
							text: markdown,
							styles: {},
						},
					],
					children: [],
				} as Block
				onChange([fallbackBlock])
				return [fallbackBlock]
			} finally {
				setIsConverting(false)
			}
		},
		[onChange]
	)

	const handleToggleMode = useCallback(() => {
		togglePreference('rawMDXMode')
	}, [togglePreference])

	// Initialize MDX content when switching to MDX mode or side-by-side mode
	useEffect(() => {
		if ((hasRawMDXMode || hasSideBySideMode) && value && value.length > 0) {
			convertBlocksToMDX(value)
		}
	}, [hasRawMDXMode, hasSideBySideMode, value, convertBlocksToMDX])

	// Handle MDX content changes
	const handleMDXChange = useCallback(
		async (newMDXContent: string) => {
			setRawMDXContent(newMDXContent)

			// If in side-by-side mode or MDX-only mode, convert the content to blocks
			if (hasSideBySideMode || hasRawMDXMode) {
				await convertMDXToBlocks(newMDXContent)
			}
		},
		[hasRawMDXMode, hasSideBySideMode, convertMDXToBlocks]
	)

	// Auto-save MDX content to blocks when in MDX mode or side-by-side mode
	useEffect(() => {
		if ((hasRawMDXMode || hasSideBySideMode) && rawMDXContent) {
			const saveTimeout = setTimeout(async () => {
				await convertMDXToBlocks(rawMDXContent)
			}, 1000) // 1 second debounce

			return () => clearTimeout(saveTimeout)
		}
	}, [hasRawMDXMode, hasSideBySideMode, rawMDXContent, convertMDXToBlocks])

	// Sync blocks to MDX content when blocks change in rich mode (or side-by-side mode)
	useEffect(() => {
		if ((!hasRawMDXMode || hasSideBySideMode) && value && value.length > 0) {
			const newMarkdown = blocksToMarkdown(value)
			if (newMarkdown !== rawMDXContent) {
				setRawMDXContent(newMarkdown)
			}
		}
	}, [hasRawMDXMode, hasSideBySideMode, value, rawMDXContent])

	// Handle splitter drag
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		isDraggingRef.current = true
		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'
	}, [])

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDraggingRef.current || !containerRef.current) return

			const containerRect = containerRef.current.getBoundingClientRect()
			const newRatio = ((e.clientX - containerRect.left) / containerRect.width) * 100
			const clampedRatio = Math.max(20, Math.min(80, newRatio)) // Limit between 20% and 80%
			setSplitRatio(clampedRatio)
		}

		const handleMouseUp = () => {
			if (!isDraggingRef.current) return
			isDraggingRef.current = false
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}

		// Always attach listeners, but only act when dragging
		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [])

	// Handle keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl+M or Cmd+M to toggle mode
			if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
				e.preventDefault()
				handleToggleMode()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [handleToggleMode])

	// Side-by-side mode
	if (hasSideBySideMode) {
		return (
			<div ref={containerRef} className={cn('relative flex h-full', className)}>
				{isConverting && (
					<div className="absolute top-0 left-0 right-0 bg-background/80 border-b border-border z-20 flex items-center justify-center p-2 text-sm text-muted-foreground">
						Converting content...
					</div>
				)}
				{/* Rich Editor Panel */}
				<div
					className={cn(
						'relative overflow-hidden border-r border-border',
						isConverting && 'opacity-50'
					)}
					style={{ width: `${splitRatio}%` }}
				>
					<BlockNoteView
						editor={editor}
						sideMenu={blockIndicator}
						formattingToolbar={showFormattingToolbar}
						slashMenu={false}
						data-theme-css-variables={false}
					>
						<NoteMentionSuggestionMenu />
						<SlashSuggestionMenu />
					</BlockNoteView>
				</div>

				{/* Resizable Splitter */}
				<div
					ref={splitterRef}
					onMouseDown={handleMouseDown}
					className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors relative group"
					role="separator"
					aria-label="Resize panels"
				>
					<div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 group-hover:w-2 transition-all" />
				</div>

				{/* MDX Editor Panel */}
				<div className="relative overflow-hidden" style={{ width: `${100 - splitRatio}%` }}>
					<RawMDXEditor
						value={rawMDXContent}
						onChange={handleMDXChange}
						disabled={disabled}
						wordWrap={wordWrap}
						fontSize={fontSize}
						fontFamily={fontFamily}
						lineHeight={lineHeight}
					/>
				</div>
			</div>
		)
	}

	if (hasRawMDXMode) {
		// Raw MDX Editor Mode
		return (
			<div className={className}>
				{isConverting && (
					<div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
						Converting content...
					</div>
				)}
				<RawMDXEditor
					value={rawMDXContent}
					onChange={handleMDXChange}
					disabled={disabled}
					wordWrap={wordWrap}
					fontSize={fontSize}
					fontFamily={fontFamily}
					lineHeight={lineHeight}
				/>
			</div>
		)
	}

	// Rich BlockNote Editor Mode
	return (
		<div className={cn(className, isConverting && 'opacity-50')}>
			{isConverting && (
				<div className="absolute top-0 left-0 right-0 bg-background/80 border-b border-border z-10 flex items-center justify-center p-2 text-sm text-muted-foreground">
					Converting content...
				</div>
			)}
			<BlockNoteView
				editor={editor}
				sideMenu={blockIndicator}
				formattingToolbar={showFormattingToolbar}
				slashMenu={false}
				data-theme-css-variables={false}
			>
				<NoteMentionSuggestionMenu />
				<SlashSuggestionMenu />
			</BlockNoteView>
		</div>
	)
}
