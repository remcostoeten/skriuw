'use client'

/**
 * File Tree Core Components
 * Accessible tree structure with keyboard navigation
 */

import {
    ChevronDown,
    ChevronRight,
    Folder as FolderIcon,
    FolderOpen,
    File as FileIcon,
    FileText,
    FileCode,
    FileJson,
    Image as ImageIcon
} from 'lucide-react'
import { createContext, useContext, useCallback, useRef, useEffect, useState, type ReactNode, type KeyboardEvent } from 'react'
import { cn } from '@skriuw/ui'
import type { TNode, TTreeState } from './types'
import { getFileColor } from './types'

// ============================================================================
// Context
// ============================================================================

type TreeContextValue = {
    state: TTreeState
    onToggleExpand: (id: string) => void
    onSelectFile: (path: string, content?: string, language?: string) => void
    showIndentLines: boolean
    enableHoverHighlight: boolean
}

const TreeContext = createContext<TreeContextValue | null>(null)

function useTreeContext() {
    const context = useContext(TreeContext)
    if (!context) {
        throw new Error('Tree components must be used within a TreeProvider')
    }
    return context
}

// ============================================================================
// TreeProvider
// ============================================================================

type TreeProviderProps = {
    children: ReactNode
    initialState?: Partial<TTreeState>
    showIndentLines?: boolean
    enableHoverHighlight?: boolean
    onSelectFile?: (path: string, content?: string, language?: string) => void
}

export function TreeProvider({
    children,
    initialState,
    showIndentLines = true,
    enableHoverHighlight = true,
    onSelectFile: onSelectFileProp
}: TreeProviderProps) {
    const [state, setState] = useState<TTreeState>({
        expandedFolders: initialState?.expandedFolders ?? new Set<string>(),
        selectedFilePath: initialState?.selectedFilePath ?? null
    })

    const onToggleExpand = useCallback((id: string) => {
        setState((prev) => {
            const next = new Set(prev.expandedFolders)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return { ...prev, expandedFolders: next }
        })
    }, [])

    const onSelectFile = useCallback(
        (path: string, content?: string, language?: string) => {
            setState((prev) => ({ ...prev, selectedFilePath: path }))
            onSelectFileProp?.(path, content, language)
        },
        [onSelectFileProp]
    )

    return (
        <TreeContext.Provider
            value={{
                state,
                onToggleExpand,
                onSelectFile,
                showIndentLines,
                enableHoverHighlight
            }}
        >
            {children}
        </TreeContext.Provider>
    )
}

// ============================================================================
// Tree
// ============================================================================

type TreeProps = {
    nodes: TNode[]
    className?: string
    ariaLabel?: string
}

export function Tree({ nodes, className, ariaLabel = 'File tree' }: TreeProps) {
    const treeRef = useRef<HTMLDivElement>(null)
    const [focusedIndex, setFocusedIndex] = useState(-1)

    // Flatten visible nodes for keyboard navigation
    const { state } = useTreeContext()
    const visibleNodes = getVisibleNodes(nodes, state.expandedFolders)

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLDivElement>) => {
            const { key } = e

            switch (key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setFocusedIndex((prev) => Math.min(prev + 1, visibleNodes.length - 1))
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setFocusedIndex((prev) => Math.max(prev - 1, 0))
                    break
                case 'Home':
                    e.preventDefault()
                    setFocusedIndex(0)
                    break
                case 'End':
                    e.preventDefault()
                    setFocusedIndex(visibleNodes.length - 1)
                    break
                case 'ArrowRight':
                case 'ArrowLeft':
                case 'Enter':
                case ' ':
                    // Handled by individual tree items
                    break
            }
        },
        [visibleNodes.length]
    )

    return (
        <div
            ref={treeRef}
            role="tree"
            aria-label={ariaLabel}
            tabIndex={0}
            className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
            onKeyDown={handleKeyDown}
        >
            {nodes.map((node, index) => (
                <TreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    focusedPath={visibleNodes[focusedIndex]?.path}
                    onFocus={() => setFocusedIndex(visibleNodes.findIndex((n) => n.path === node.path))}
                />
            ))}
        </div>
    )
}

// ============================================================================
// TreeNode
// ============================================================================

type TreeNodeProps = {
    node: TNode
    depth: number
    focusedPath?: string
    onFocus: () => void
}

function TreeNode({ node, depth, focusedPath, onFocus }: TreeNodeProps) {
    const { state, onToggleExpand, onSelectFile, showIndentLines, enableHoverHighlight } = useTreeContext()
    const isExpanded = state.expandedFolders.has(node.id)
    const isSelected = state.selectedFilePath === node.path
    const isFocused = focusedPath === node.path
    const itemRef = useRef<HTMLDivElement>(null)

    // Scroll focused item into view
    useEffect(() => {
        if (isFocused && itemRef.current) {
            itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
    }, [isFocused])

    const handleClick = useCallback(() => {
        if (node.type === 'folder') {
            onToggleExpand(node.id)
        } else {
            onSelectFile(node.path, node.content, node.language)
        }
    }, [node, onToggleExpand, onSelectFile])

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick()
            } else if (e.key === 'ArrowRight' && node.type === 'folder' && !isExpanded) {
                e.preventDefault()
                onToggleExpand(node.id)
            } else if (e.key === 'ArrowLeft' && node.type === 'folder' && isExpanded) {
                e.preventDefault()
                onToggleExpand(node.id)
            }
        },
        [handleClick, node, isExpanded, onToggleExpand]
    )

    return (
        <div role="treeitem" aria-expanded={node.type === 'folder' ? isExpanded : undefined} aria-selected={isSelected}>
            <div
                ref={itemRef}
                className={cn(
                    'group flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none rounded-sm transition-colors',
                    enableHoverHighlight && 'hover:bg-muted/50',
                    isSelected && 'bg-accent text-accent-foreground',
                    isFocused && 'ring-2 ring-ring ring-offset-1'
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                onFocus={onFocus}
                tabIndex={-1}
            >
                {/* Indent lines */}
                {showIndentLines &&
                    depth > 0 &&
                    Array.from({ length: depth }).map((_, i) => (
                        <span
                            key={i}
                            className="absolute w-px bg-border/40"
                            style={{
                                left: `${i * 16 + 12}px`,
                                top: 0,
                                bottom: 0
                            }}
                        />
                    ))}

                {/* Expand/Collapse button */}
                {node.type === 'folder' ? (
                    <button
                        type="button"
                        className="flex-shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleExpand(node.id)
                        }}
                        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                    </button>
                ) : (
                    <span className="w-5" /> // Spacer for files
                )}

                {/* Icon */}
                {node.type === 'folder' ? (
                    isExpanded ? (
                        <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    ) : (
                        <FolderIcon className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    )
                ) : (
                    <FileNodeIcon path={node.path} />
                )}

                {/* Name */}
                <span className="truncate text-sm">{node.name}</span>
            </div>

            {/* Children */}
            {node.type === 'folder' && isExpanded && node.children && (
                <div role="group">
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            focusedPath={focusedPath}
                            onFocus={() => { }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ============================================================================
// FileNodeIcon
// ============================================================================

function FileNodeIcon({ path }: { path: string }) {
    const extension = path.split('.').pop()?.toLowerCase() || ''
    const colorClass = getFileColor(path)

    switch (extension) {
        case 'ts':
        case 'tsx':
        case 'js':
        case 'jsx':
        case 'py':
        case 'go':
        case 'rs':
        case 'java':
        case 'c':
        case 'cpp':
            return <FileCode className={cn('w-4 h-4 flex-shrink-0', colorClass)} />
        case 'json':
        case 'yaml':
        case 'yml':
        case 'toml':
            return <FileJson className={cn('w-4 h-4 flex-shrink-0', colorClass)} />
        case 'md':
        case 'mdx':
        case 'txt':
            return <FileText className={cn('w-4 h-4 flex-shrink-0', colorClass)} />
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
        case 'webp':
            return <ImageIcon className="w-4 h-4 flex-shrink-0 text-purple-400" />
        default:
            return <FileIcon className={cn('w-4 h-4 flex-shrink-0', colorClass)} />
    }
}

// ============================================================================
// Helpers
// ============================================================================

function getVisibleNodes(nodes: TNode[], expandedFolders: Set<string>): TNode[] {
    const visible: TNode[] = []

    function traverse(nodeList: TNode[]) {
        for (const node of nodeList) {
            visible.push(node)
            if (node.type === 'folder' && expandedFolders.has(node.id) && node.children) {
                traverse(node.children)
            }
        }
    }

    traverse(nodes)
    return visible
}
