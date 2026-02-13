'use client'

import { useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from 'react'
import { cn } from '@skriuw/shared'

type CodeEditorProps = {
	value: string
	onChange: (value: string) => void
	onExit?: () => void
	language: string
	placeholder?: string
	className?: string
	autoFocus?: boolean
}

export function CodeEditor({
	value,
	onChange,
	onExit,
	language,
	placeholder = 'Enter code...',
	className,
	autoFocus = false
}: CodeEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const adjustHeight = useCallback(() => {
		const textarea = textareaRef.current
		if (!textarea) return

		textarea.style.height = 'auto'
		textarea.style.height = `${Math.max(60, textarea.scrollHeight)}px`
	}, [])

	useEffect(() => {
		adjustHeight()
	}, [value, adjustHeight])

	useEffect(() => {
		if (autoFocus && textareaRef.current) {
			requestAnimationFrame(() => {
				textareaRef.current?.focus()
			})
		}
	}, [autoFocus])

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			const textarea = e.currentTarget

			if (e.key === 'Escape') {
				e.preventDefault()
				onExit?.()
				return
			}

			if (e.key === 'Tab' && !e.shiftKey) {
				e.preventDefault()

				const start = textarea.selectionStart
				const end = textarea.selectionEnd
				const newValue = value.substring(0, start) + '  ' + value.substring(end)

				onChange(newValue)

				requestAnimationFrame(() => {
					if (textareaRef.current) {
						textareaRef.current.selectionStart = start + 2
						textareaRef.current.selectionEnd = start + 2
					}
				})
				return
			}

			if (e.key === 'Enter') {
				e.preventDefault()

				const start = textarea.selectionStart
				const lineStart = value.lastIndexOf('\n', start - 1) + 1
				const currentLine = value.substring(lineStart, start)
				const indent = currentLine.match(/^(\s*)/)?.[1] || ''

				const newValue =
					value.substring(0, start) +
					'\n' +
					indent +
					value.substring(textarea.selectionEnd)
				onChange(newValue)

				const newPos = start + 1 + indent.length
				requestAnimationFrame(() => {
					if (textareaRef.current) {
						textareaRef.current.selectionStart = newPos
						textareaRef.current.selectionEnd = newPos
					}
				})
			}
		},
		[value, onChange, onExit]
	)

	const handleChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			onChange(e.target.value)
		},
		[onChange]
	)

	return (
		<textarea
			ref={textareaRef}
			value={value}
			onChange={handleChange}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			spellCheck={false}
			autoComplete='off'
			autoCorrect='off'
			autoCapitalize='off'
			data-gramm='false'
			className={cn(
				'w-full min-h-[60px] resize-none',
				'bg-transparent border-0 focus:ring-0 focus:outline-none',
				'font-mono',
				'text-foreground placeholder:text-muted-foreground/50',
				'py-[1rem] pl-[3.5rem] pr-[1rem]',
				'touch-manipulation',
				className
			)}
			style={{
				fontSize: '0.8125rem',
				lineHeight: '1.7',
				whiteSpace: 'pre-wrap',
				wordWrap: 'break-word',
				overflowWrap: 'anywhere',
				tabSize: 2,
				fontFamily:
					'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
			}}
			aria-label={`Code editor for ${language}`}
		/>
	)
}
