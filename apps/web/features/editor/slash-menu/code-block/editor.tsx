'use client'

/**
 * Code Editor Component
 * Editable textarea for code input with proper keyboard handling
 */

import { useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from 'react'
import { cn } from '@skriuw/shared'

type CodeEditorProps = {
    value: string
    onChange: (value: string) => void
    onBlur?: () => void
    onFocus?: () => void
    language: string
    placeholder?: string
    className?: string
    autoFocus?: boolean
}

export function CodeEditor({
    value,
    onChange,
    onBlur,
    onFocus,
    language,
    placeholder = 'Enter code...',
    className,
    autoFocus = false
}: CodeEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-resize textarea height
    const adjustHeight = useCallback(() => {
        const textarea = textareaRef.current
        if (!textarea) return

        // Reset height to auto to get correct scrollHeight
        textarea.style.height = 'auto'
        // Set height to scrollHeight (minimum 100px)
        textarea.style.height = `${Math.max(100, textarea.scrollHeight)}px`
    }, [])

    // Adjust height on value change
    useEffect(() => {
        adjustHeight()
    }, [value, adjustHeight])

    // Auto-focus on mount if requested
    useEffect(() => {
        if (autoFocus && textareaRef.current) {
            // Use requestAnimationFrame for reliable focus
            requestAnimationFrame(() => {
                textareaRef.current?.focus()
            })
        }
    }, [autoFocus])

    // Handle tab key - insert tab character instead of moving focus
    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            const textarea = e.currentTarget

            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault()

                // Insert tab at cursor position
                const start = textarea.selectionStart
                const end = textarea.selectionEnd
                const newValue = value.substring(0, start) + '\t' + value.substring(end)

                onChange(newValue)

                // Restore cursor position after the tab
                requestAnimationFrame(() => {
                    if (textareaRef.current) {
                        textareaRef.current.selectionStart = start + 1
                        textareaRef.current.selectionEnd = start + 1
                    }
                })
            }

            // Shift+Tab exits the editor (default behavior is fine)
        },
        [value, onChange]
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
            onBlur={onBlur}
            onFocus={onFocus}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-gramm="false" // Disable Grammarly
            className={cn(
                'w-full min-h-[100px] resize-none',
                'bg-transparent border-0 focus:ring-0 focus:outline-none',
                'font-mono text-sm leading-relaxed',
                'text-foreground placeholder:text-muted-foreground/50',
                'px-4 py-3',
                className
            )}
            style={{
                // Prevent weird line height issues
                lineHeight: '1.6',
                // Allow wrapping
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflowWrap: 'anywhere',
                // Tab size
                tabSize: 2
            }}
            aria-label={`Code editor for ${language}`}
        />
    )
}
