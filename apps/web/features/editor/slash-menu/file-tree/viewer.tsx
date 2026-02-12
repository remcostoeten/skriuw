'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Copy, Check, ExternalLink, ChevronRight } from 'lucide-react'
import { cn } from '@skriuw/shared'
import type { TNode } from './types'
import { getLanguageFromPath } from './types'



type FileViewerProps = {
    selectedNode: TNode | null
    className?: string
}

type FileHeaderProps = {
    path: string
    language: string
    onCopy?: () => void
}



export function FileViewer({ selectedNode, className }: FileViewerProps) {
    const [highlightedCode, setHighlightedCode] = useState<string>('')
    const [copied, setCopied] = useState(false)

    // Highlight code when selection changes
    useEffect(() => {
        if (!selectedNode || selectedNode.type === 'folder' || !selectedNode.content) {
            setHighlightedCode('')
            return
        }

        const language = selectedNode.language || getLanguageFromPath(selectedNode.path)

        // For now, use a simple code display
        // Shiki integration can be added later for full syntax highlighting
        setHighlightedCode(selectedNode.content)
    }, [selectedNode])

    const handleCopy = useCallback(async () => {
        if (!selectedNode?.content) return

        try {
            await navigator.clipboard.writeText(selectedNode.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }, [selectedNode])

    if (!selectedNode) {
        return (
            <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
                <p className="text-sm">Select a file to view its contents</p>
            </div>
        )
    }

    if (selectedNode.type === 'folder') {
        return (
            <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
                <p className="text-sm">Select a file to view its contents</p>
            </div>
        )
    }

    const language = selectedNode.language || getLanguageFromPath(selectedNode.path)
    const isMarkdown = ['md', 'mdx'].includes(selectedNode.path.split('.').pop()?.toLowerCase() || '')

    return (
        <div className={cn('flex flex-col h-full', className)}>
            {/* File Header */}
            <FileHeader path={selectedNode.path} language={language} onCopy={handleCopy} />

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {isMarkdown ? (
                    <MarkdownViewer content={selectedNode.content || ''} />
                ) : (
                    <CodeViewer code={highlightedCode} language={language} />
                )}
            </div>

            {/* Copy confirmation toast */}
            {copied && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-md text-green-400 text-sm animate-in fade-in slide-in-from-bottom-2">
                    <Check className="w-4 h-4" />
                    Copied to clipboard
                </div>
            )}
        </div>
    )
}



function FileHeader({ path, language, onCopy }: FileHeaderProps) {
    const parts = path.split('/')

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm overflow-hidden">
                {parts.map((part, i) => (
                    <span key={i} className="flex items-center gap-1 min-w-0">
                        {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        <span
                            className={cn(
                                'truncate',
                                i === parts.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                            )}
                        >
                            {part}
                        </span>
                    </span>
                ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {language}
                </span>
                <button
                    type="button"
                    onClick={onCopy}
                    className="p-1.5 hover:bg-muted rounded-md transition-colors"
                    aria-label="Copy file contents"
                >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>
        </div>
    )
}



type CodeViewerProps = {
    code: string
    language: string
}

function CodeViewer({ code, language }: CodeViewerProps) {
    const lines = code.split('\n')
    const lineNumberWidth = String(lines.length).length

    return (
        <div className="font-mono text-sm w-full min-w-0 overflow-x-auto">
            <table className="w-full border-collapse table-fixed">
                <tbody>
                    {lines.map((line, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                            <td
                                className="px-4 py-0.5 text-right text-muted-foreground select-none border-r border-border/50 tabular-nums"
                                style={{ width: `${lineNumberWidth + 2}ch` }}
                                aria-hidden="true"
                            >
                                {i + 1}
                            </td>
                            <td className="px-4 py-0.5 whitespace-pre overflow-x-auto">
                                {line || '\u00A0'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}



type MarkdownViewerProps = {
    content: string
}

function MarkdownViewer({ content }: MarkdownViewerProps) {
    // Simple markdown rendering - can be enhanced with a full parser
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none p-4">
            <pre className="whitespace-pre-wrap font-sans">{content}</pre>
        </div>
    )
}



type ResizablePanelGroupProps = {
    children: React.ReactNode
    direction?: 'horizontal' | 'vertical'
    className?: string
}

export function ResizablePanelGroup({ children, direction = 'horizontal', className }: ResizablePanelGroupProps) {
    return (
        <div
            className={cn(
                'flex h-full w-full min-w-0',
                direction === 'horizontal' ? 'flex-row' : 'flex-col',
                className
            )}
        >
            {children}
        </div>
    )
}

type ResizablePanelProps = {
    children: React.ReactNode
    defaultSize?: number
    minSize?: number
    maxSize?: number
    className?: string
    collapsible?: boolean
    collapsed?: boolean
}

export function ResizablePanel({
    children,
    defaultSize = 50,
    className,
    collapsed = false
}: ResizablePanelProps) {
    const actualSize = collapsed ? 0 : defaultSize

    return (
        <div
            className={cn('overflow-hidden transition-all min-w-0', className)}
            style={{ flex: `0 0 ${actualSize}%` }}
        >
            {children}
        </div>
    )
}

type ResizableHandleProps = {
    onResize?: (delta: number) => void
    className?: string
}

export function ResizableHandle({ onResize, className }: ResizableHandleProps) {
    const handleRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    useEffect(() => {
        if (!isDragging) return

        const handleMouseMove = (e: MouseEvent) => {
            onResize?.(e.movementX)
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, onResize])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            const step = e.shiftKey ? 50 : 10
            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                onResize?.(-step)
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                onResize?.(step)
            }
        },
        [onResize]
    )

    return (
        <div
            ref={handleRef}
            className={cn(
                'flex-shrink-0 w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors',
                isDragging && 'bg-primary',
                className
            )}
            onMouseDown={() => setIsDragging(true)}
            onKeyDown={handleKeyDown}
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            aria-label="Resize panels"
        />
    )
}
