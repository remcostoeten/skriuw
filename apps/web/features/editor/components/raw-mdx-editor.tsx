import React, { useEffect, useRef, useCallback } from 'react'
import { cn } from '@skriuw/core-logic'

interface RawMDXEditorProps {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	className?: string
	disabled?: boolean
	autoFocus?: boolean
	wordWrap?: boolean
	fontSize?: string
	fontFamily?: string
	lineHeight?: number
	spellCheck?: boolean
}

/**
 * Raw MDX Editor component
 * Provides a textarea for typing raw MDX/Markdown syntax
 */
export function RawMDXEditor({
	value,
	onChange,
	placeholder = 'Start typing your MDX...',
	className,
	disabled = false,
	autoFocus = false,
	wordWrap = true,
	fontSize = '16px',
	fontFamily = '"Inter", system-ui, sans-serif',
	lineHeight = 1.6,
	spellCheck = true,
}: RawMDXEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	// Handle tab key for indentation
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Tab') {
				e.preventDefault()
				const textarea = e.currentTarget
				const start = textarea.selectionStart
				const end = textarea.selectionEnd

				const newValue = value.substring(0, start) + '  ' + value.substring(end)
				onChange(newValue)

				// Restore cursor position
				setTimeout(() => {
					textarea.selectionStart = textarea.selectionEnd = start + 2
				}, 0)
			}

			// Handle cmd+enter for insert newline at current position
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault()
				const textarea = e.currentTarget
				const start = textarea.selectionStart
				const end = textarea.selectionEnd

				const newValue = value.substring(0, start) + '\n' + value.substring(end)
				onChange(newValue)

				// Restore cursor position
				setTimeout(() => {
					textarea.selectionStart = textarea.selectionEnd = start + 1
				}, 0)
			}
		},
		[value, onChange]
	)

	// Auto-focus if requested
	useEffect(() => {
		if (autoFocus && textareaRef.current) {
			textareaRef.current.focus()
		}
	}, [autoFocus])

	// Auto-resize textarea based on content
	const adjustHeight = useCallback(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto'
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
		}
	}, [])

	// Adjust height when content changes
	useEffect(() => {
		adjustHeight()
	}, [value, adjustHeight])

	return (
		<div className={cn('relative', className)}>
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				disabled={disabled}
				spellCheck={spellCheck}
				className={cn(
					'w-full min-h-[400px] p-4 resize-none focus:outline-none',
					'font-mono text-sm leading-relaxed',
					'bg-background border-0 focus:ring-0',
					'placeholder:text-muted-foreground',
					'disabled:cursor-not-allowed disabled:opacity-50'
				)}
				style={{
					fontSize,
					fontFamily: fontFamily.includes('mono')
						? fontFamily
						: '"Fira Code", "Menlo", "Monaco", monospace',
					lineHeight: lineHeight.toString(),
					whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
					wordWrap: wordWrap ? 'break-word' : 'normal',
					overflowX: wordWrap ? 'hidden' : 'auto',
				}}
				// Enable line numbers visually with CSS
				data-line-numbers="true"
			/>

			{/* MDX syntax hint */}
			<div className="absolute bottom-4 right-4 text-xs text-muted-foreground pointer-events-none">
				MDX Mode • Press Tab to indent • Cmd+Enter for new line
			</div>
		</div>
	)
}

/**
 * Add line numbers CSS
 * This can be added to a global CSS file or styled component
 */
export const lineNumbersCSS = `
  textarea[data-line-numbers="true"] {
    padding-left: 3rem;
    background-image: linear-gradient(to right, #f3f4f6 0%, #f3f4f6 2.5rem, transparent 2.5rem);
    background-size: 100% 1.5rem;
    background-position: 0 0;
  }

  textarea[data-line-numbers="true"]::before {
    content: attr(data-line-numbers);
    position: absolute;
    left: 0;
    top: 0;
    width: 2.5rem;
    height: 100%;
    background: #f9fafb;
    border-right: 1px solid #e5e7eb;
    padding: 0.75rem 0.5rem;
    font-size: 12px;
    line-height: 1.5rem;
    color: #6b7280;
    text-align: right;
    user-select: none;
    pointer-events: none;
    overflow: hidden;
  }
`
