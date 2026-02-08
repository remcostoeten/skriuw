'use client'

/**
 * Code Block Renderer
 * Read-only syntax highlighted view using react-syntax-highlighter
 */

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { PrismAsync as SyntaxHighlighter } from 'react-syntax-highlighter'
import { cn } from '@skriuw/shared'
import { codeBlockTheme } from './types'
import { LanguageIcon } from './language-icons'
import { AnimatePresence, motion } from 'framer-motion'

type CodeRendererProps = {
    code: string
    language: string
    fileName?: string
    showLineNumbers?: boolean
    className?: string
    onCopy?: (code: string) => void
    onClick?: () => void
}

export function CodeRenderer({
    code,
    language,
    fileName,
    showLineNumbers = true,
    className,
    onCopy,
    onClick
}: CodeRendererProps) {
    const [isCopied, setIsCopied] = useState(false)

    const copyToClipboard = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation()
            try {
                await navigator.clipboard.writeText(code)
                setIsCopied(true)
                onCopy?.(code)
                setTimeout(() => setIsCopied(false), 2000)
            } catch (error) {
                console.error('Failed to copy:', error)
            }
        },
        [code, onCopy]
    )

    return (
        <div className={cn('relative group/code', className)} onClick={onClick}>
            <div
                className={cn(
                    'relative overflow-hidden bg-[hsl(var(--sh-background))]/90 backdrop-blur',
                    'shadow-xl transition-all duration-300',
                    'ring-1 ring-[hsl(var(--sh-border))]',
                    'group-hover/code:ring-[hsl(var(--sh-border))]/80',
                    'group-hover/code:shadow-2xl',
                    'rounded-xl'
                )}
            >
                {/* Header */}
                <header
                    className={cn(
                        'flex justify-between items-center px-4 py-3',
                        'bg-[hsl(var(--sh-background))]/80 backdrop-blur-md',
                        'border-b border-[hsl(var(--sh-border))] z-10 relative'
                    )}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-muted-foreground/60">
                            <LanguageIcon language={language} size={14} />
                        </span>
                        {fileName && (
                            <span className="text-xs text-[hsl(var(--sh-text))] opacity-70 font-mono tracking-tight">
                                {fileName}
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={copyToClipboard}
                        className={cn(
                            'text-muted-foreground/60 hover:text-[hsl(var(--sh-text))]',
                            'transition-all duration-200 p-1.5 rounded-md',
                            'hover:bg-[hsl(var(--sh-text))]/5'
                        )}
                        title="Copy code"
                        aria-label="Copy code to clipboard"
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            {isCopied ? (
                                <motion.span
                                    key="check"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Check size={14} className="text-emerald-500" />
                                </motion.span>
                            ) : (
                                <motion.span
                                    key="copy"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Copy size={14} />
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </header>

                {/* Code Content */}
                <div className="relative overflow-x-auto max-w-full">
                    <div className="py-4">
                        <SyntaxHighlighter
                            language={language.toLowerCase()}
                            style={codeBlockTheme as any}
                            customStyle={{
                                margin: 0,
                                padding: 0,
                                background: 'transparent',
                                fontSize: '0.8125rem',
                                lineHeight: '1.7'
                            }}
                            showLineNumbers={showLineNumbers}
                            lineNumberStyle={{
                                position: 'absolute' as const,
                                left: 0,
                                width: '3rem',
                                paddingRight: '0.75rem',
                                color: 'hsl(var(--sh-comment))',
                                textAlign: 'right' as const,
                                userSelect: 'none' as const,
                                fontSize: '0.75rem',
                                opacity: 0.5
                            }}
                            wrapLines={true}
                            wrapLongLines={true}
                            lineProps={() => ({
                                style: {
                                    display: 'block',
                                    paddingLeft: '3.5rem',
                                    position: 'relative' as const,
                                    paddingRight: '1rem',
                                    backgroundColor: 'transparent',
                                    borderLeft: '2px solid transparent'
                                }
                            })}
                        >
                            {code.trim() || ' '}
                        </SyntaxHighlighter>
                    </div>
                </div>
            </div>
        </div>
    )
}
