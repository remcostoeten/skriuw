'use client'

import { Suspense, lazy, useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@skriuw/shared'
import { codeBlockTheme, detectLanguage } from './types'

const SyntaxHighlighter = lazy(() =>
    import('react-syntax-highlighter').then((mod) => ({
        default: mod.PrismAsync
    }))
)

// Use strict pixel values to avoid rounding errors between browsers/layers
const MONOSPACE_FONT = 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const FONT_SIZE = '13px'
const LINE_HEIGHT = '20px' // Exact pixel value

const SHARED_STYLES: React.CSSProperties = {
    fontFamily: MONOSPACE_FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    tabSize: 2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'anywhere',
    margin: 0,
    border: 0,
    outline: 'none',
    boxSizing: 'border-box'
}

// Exact padding values shared between textarea and pre
const PADDING = {
    top: 16,    // 1rem
    right: 16,  // 1rem
    bottom: 16, // 1rem
    left: 60    // 3.75rem for line numbers
}

function CodeSkeleton({ lineCount }: { lineCount: number }) {
    const lines = Math.max(lineCount, 3)
    return (
        <div
            className="animate-pulse"
            aria-hidden="true"
            style={{
                padding: `${PADDING.top}px ${PADDING.right}px ${PADDING.bottom}px ${PADDING.left}px`
            }}
        >
            {Array.from({ length: lines }, (_, i) => (
                <div
                    key={i}
                    className="bg-muted-foreground/10 mb-1 rounded-sm"
                    style={{
                        width: `${25 + ((i * 37) % 55)}%`,
                        height: '14px', // Slightly smaller than line-height
                        marginTop: '3px', // Center vertically in line-height
                        marginBottom: '3px'
                    }}
                />
            ))}
        </div>
    )
}

const CopyButton = memo(function CopyButton({ code }: { code: string }) {
    const [isCopied, setIsCopied] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }, [])

    const handleCopy = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        try {
            await navigator.clipboard.writeText(code)
            setIsCopied(true)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => setIsCopied(false), 2000)
        } catch { }
    }, [code])

    return (
        <button
            type="button"
            onClick={handleCopy}
            className={cn(
                'p-1.5 transition-all duration-200',
                'text-muted-foreground/40 hover:text-foreground',
                'bg-transparent hover:bg-muted/10 rounded-md',
                'touch-manipulation select-none'
            )}
            aria-label={isCopied ? 'Copied to clipboard' : 'Copy code to clipboard'}
            aria-live="polite"
        >
            {isCopied ? (
                <Check size={14} className="text-emerald-400" aria-hidden="true" />
            ) : (
                <Copy size={14} aria-hidden="true" />
            )}
        </button>
    )
})

type HighlightLayerProps = {
    code: string
    language: string
}

const HighlightLayer = memo(function HighlightLayer({ code, language }: HighlightLayerProps) {
    const lineCount = useMemo(() => code.split('\n').length, [code])

    return (
        <div
            className="pointer-events-none select-none overflow-hidden"
            aria-hidden="true"
        >
            <Suspense fallback={<CodeSkeleton lineCount={lineCount} />}>
                <SyntaxHighlighter
                    language={language.toLowerCase()}
                    style={codeBlockTheme as any}
                    customStyle={{
                        ...SHARED_STYLES,
                        padding: `${PADDING.top}px ${PADDING.right}px ${PADDING.bottom}px 0`, // Left padding handled by lineProps
                        background: 'transparent',
                        height: '100%',
                    }}
                    showLineNumbers={true}
                    lineNumberStyle={{
                        minWidth: '40px', // Fixed width
                        paddingRight: '10px',
                        color: 'hsl(var(--sh-comment))',
                        textAlign: 'right' as const,
                        userSelect: 'none' as const,
                        fontSize: '11px',
                        opacity: 0.4,
                        lineHeight: LINE_HEIGHT,
                    }}
                    wrapLines={true}
                    wrapLongLines={true}
                    lineProps={() => ({
                        style: {
                            display: 'block',
                            paddingRight: '16px', // Match textarea padding
                            paddingLeft: `${PADDING.left}px`,
                            textIndent: `-${PADDING.left}px`,
                            marginLeft: `${PADDING.left}px`,
                            backgroundColor: 'transparent',
                        }
                    })}
                    codeTagProps={{
                        style: {
                            ...SHARED_STYLES,
                            display: 'block',
                            transform: 'translateZ(0)'
                        }
                    }}
                >
                    {code || ' '}
                </SyntaxHighlighter>
            </Suspense>
        </div>
    )
})

type OverlayEditorProps = {
    code: string
    language: string
    onChange: (code: string) => void
    onExit?: () => void
    autoFocus?: boolean
    readOnly?: boolean
}

export function OverlayEditor({
    code,
    language,
    onChange,
    onExit,
    autoFocus = false,
    readOnly = false,
}: OverlayEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const mirrorRef = useRef<HTMLDivElement>(null)

    const syncScroll = useCallback(() => {
        if (textareaRef.current && mirrorRef.current) {
            mirrorRef.current.scrollTop = textareaRef.current.scrollTop
            mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft
        }
    }, [])

    const adjustHeight = useCallback(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.max(60, textarea.scrollHeight)}px`
    }, [])

    useEffect(() => {
        adjustHeight()
    }, [code, adjustHeight])

    useEffect(() => {
        if (autoFocus && textareaRef.current) {
            requestAnimationFrame(() => textareaRef.current?.focus())
        }
    }, [autoFocus])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget

        if (e.key === 'Escape') {
            e.preventDefault()
            textarea.blur()
            onExit?.()
            return
        }

        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const newValue = code.substring(0, start) + '  ' + code.substring(end)
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
            const lineStart = code.lastIndexOf('\n', start - 1) + 1
            const currentLine = code.substring(lineStart, start)
            const indent = currentLine.match(/^(\s*)/)?.[1] || ''
            const newValue = code.substring(0, start) + '\n' + indent + code.substring(textarea.selectionEnd)
            onChange(newValue)
            const newPos = start + 1 + indent.length
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = newPos
                    textareaRef.current.selectionEnd = newPos
                }
            })
        }
    }, [code, onChange, onExit])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value)
    }, [onChange])

    const resolvedLanguage = useMemo(
        () => code ? detectLanguage(code) : language,
        [code, language]
    )

    return (
        <div className="relative group/code">
            <div className="absolute top-2 right-2 z-20 opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100 transition-opacity duration-150">
                <CopyButton code={code} />
            </div>

            <div ref={mirrorRef} className="overflow-hidden pointer-events-none" aria-hidden="true">
                <HighlightLayer code={code} language={resolvedLanguage} />
            </div>

            <textarea
                ref={textareaRef}
                value={code}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onScroll={syncScroll}
                readOnly={readOnly}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                className={cn(
                    'absolute inset-0 w-full h-full resize-none',
                    'bg-transparent border-0 outline-none',
                    'text-transparent caret-foreground',
                    'selection:bg-primary/20',
                    'touch-manipulation',
                    readOnly && 'cursor-default'
                )}
                style={{
                    ...SHARED_STYLES,
                    padding: `${PADDING.top}px ${PADDING.right}px ${PADDING.bottom}px ${PADDING.left}px`,
                    caretColor: 'hsl(var(--foreground))',
                    WebkitTextFillColor: 'transparent', // Crucial for ghosting fix
                    color: 'transparent',
                }}
                aria-label={`Code editor — ${resolvedLanguage}`}
                aria-multiline="true"
                role="textbox"
            />

            {!code && (
                <div
                    className="absolute pointer-events-none text-muted-foreground/30 select-none"
                    style={{
                        ...SHARED_STYLES,
                        top: PADDING.top,
                        left: PADDING.left,
                        fontFamily: MONOSPACE_FONT // Explicitly set font here too
                    }}
                    aria-hidden="true"
                >
                    Write or paste code...
                </div>
            )}
        </div>
    )
}

export { CopyButton }
