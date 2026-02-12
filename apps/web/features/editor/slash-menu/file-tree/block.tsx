'use client'

/**
 * File Tree BlockNote Block Specification
 * Creates a custom block for BlockNote that renders an interactive file tree
 */

import { createReactBlockSpec } from '@blocknote/react'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { Settings, ChevronRight, ChevronDown, Folder, FolderOpen, Palette, Lock, Unlock } from 'lucide-react'
import { cn } from '@skriuw/shared'
import type { TComponent, TNode, TStyle, TFile } from './types'
import { buildTreeFromFiles, flattenTreeToFiles, updateNode, findNodeByPath, DEFAULT_TREE_FILES } from './utils'
import { getFileColor, getLanguageFromPath } from './types'
import { TreeProvider, Tree } from './components'
import { FileViewer, ResizablePanelGroup, ResizablePanel, ResizableHandle } from './viewer'
import { ConfigModal } from './config-modal'



/** Check if screen is mobile-sized */
function useIsMobile(breakpoint = 768): boolean {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return

        const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
        setIsMobile(mq.matches)

        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [breakpoint])

    return isMobile
}

/** Check if user prefers reduced motion */
function usePrefersReducedMotion(): boolean {
    const [prefersReduced, setPrefersReduced] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return

        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        setPrefersReduced(mq.matches)

        const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    return prefersReduced
}



const DEFAULT_COMPONENT: TComponent = {
    name: 'Project',
    version: '1.0.0',
    showIndentLines: true,
    enableHoverHighlight: true,
    files: DEFAULT_TREE_FILES
}



export const fileTreeBlockSpec = createReactBlockSpec(
    {
        type: 'fileTree',
        propSchema: {
            /** Serialized TComponent JSON */
            content: {
                default: JSON.stringify(DEFAULT_COMPONENT)
            },
            /** Visual style variant */
            style: {
                default: 'full' as TStyle
            },
            /** Show indent guide lines */
            showIndentLines: {
                default: true
            },
            /** Expand all folders by default */
            initialExpandedAll: {
                default: true
            },
            /** Lock the file tree to view-only mode */
            locked: {
                default: false
            }
        },
        content: 'none'
    },
    {
        render: function FileTreeBlockRender({ block, editor }) {
            const contentString = block.props.content as string
            const style = (block.props.style as TStyle) || 'full'
            const showIndentLines = block.props.showIndentLines !== false
            const isLocked = block.props.locked === true

            // Parse component data
            const component = useMemo<TComponent>(() => {
                try {
                    return JSON.parse(contentString)
                } catch {
                    return DEFAULT_COMPONENT
                }
            }, [contentString])

            const [nodes, setNodes] = useState<TNode[]>([])

            const [isConfigOpen, setIsConfigOpen] = useState(false)
            const [selectedNode, setSelectedNode] = useState<TNode | null>(null)
            const [leftPanelSize, setLeftPanelSize] = useState(35)
            const isCollapsed = leftPanelSize === 0

            const isMobile = useIsMobile()
            const prefersReducedMotion = usePrefersReducedMotion()

            // Sync nodes when content changes externally
            useEffect(() => {
                const tree = buildTreeFromFiles(component.files)
                setNodes(block.props.initialExpandedAll ? expandAll(tree) : tree)
            }, [component.files, block.props.initialExpandedAll])

            // Handle file selection
            const handleSelectFile = useCallback(
                (path: string, content?: string, language?: string) => {
                    const node = findNodeByPath(nodes, path)
                    if (node) {
                        setSelectedNode(node)
                    }
                },
                [nodes]
            )

            // Handle config save
            const handleSaveConfig = useCallback(
                (updatedComponent: TComponent) => {
                    editor.updateBlock(block.id, {
                        props: {
                            content: JSON.stringify(updatedComponent),
                            style,
                            showIndentLines
                        }
                    })
                    setNodes(buildTreeFromFiles(updatedComponent.files))
                },
                [editor, block.id, style, showIndentLines]
            )

            // Toggle style
            const toggleStyle = useCallback(() => {
                if (isLocked) return
                const styles: TStyle[] = ['full', 'card', 'minimal']
                const currentIndex = styles.indexOf(style)
                const nextStyle = styles[(currentIndex + 1) % styles.length]
                editor.updateBlock(block.id, {
                    props: { ...block.props, style: nextStyle }
                })
            }, [editor, block.id, style, block.props, isLocked])

            // Toggle lock
            const toggleLock = useCallback(() => {
                editor.updateBlock(block.id, {
                    props: { ...block.props, locked: !isLocked }
                })
            }, [editor, block.id, block.props, isLocked])

            const handleResize = useCallback((delta: number) => {
                setLeftPanelSize((prev) => {
                    const newSize = prev + (delta / 10)
                    if (newSize < 15) return 0
                    return Math.max(20, Math.min(70, newSize))
                })
            }, [])

            // Container classes based on style
            const containerClasses = cn(
                'relative group my-4 overflow-hidden w-full',
                style === 'full' && 'rounded-lg border border-border bg-card shadow-sm',
                style === 'card' && 'rounded-lg border border-border bg-card/50',
                style === 'minimal' && '',
                // Reduced motion
                !prefersReducedMotion && 'transition-all duration-200',
                // Locked visual indicator
                isLocked && 'ring-1 ring-amber-500/30'
            )

            return (
                <div className={containerClasses}>
                    {/* Floating Actions */}
                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                            type="button"
                            onClick={toggleLock}
                            className={cn(
                                'p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm',
                                isLocked && 'bg-amber-500/20 border-amber-500/50'
                            )}
                            title={isLocked ? 'Unlock file tree' : 'Lock file tree (view-only)'}
                            aria-label={isLocked ? 'Unlock file tree' : 'Lock file tree'}
                        >
                            {isLocked ? (
                                <Lock className="w-4 h-4 text-amber-500" />
                            ) : (
                                <Unlock className="w-4 h-4 text-muted-foreground" />
                            )}
                        </button>
                        {!isLocked && (
                            <>
                                <button
                                    type="button"
                                    onClick={toggleStyle}
                                    className="p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm"
                                    title={`Current: ${style}. Click to toggle.`}
                                    aria-label="Toggle style"
                                >
                                    <Palette className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsConfigOpen(true)}
                                    className="p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm"
                                    title="Configure file tree"
                                    aria-label="Configure file tree"
                                >
                                    <Settings className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Header (for full/card styles) */}
                    {(style === 'full' || style === 'card') && (
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                            <div className="flex items-center gap-2">
                                <Folder className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm font-medium">{component.name}</span>
                                {component.version && (
                                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        v{component.version}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Main Content */}
                    {style === 'full' ? (
                        isMobile ? (
                            // Mobile: Stacked layout
                            <div className="flex flex-col">
                                <div className="max-h-[200px] overflow-auto p-2 border-b border-border">
                                    <TreeProvider
                                        showIndentLines={showIndentLines}
                                        enableHoverHighlight={component.enableHoverHighlight}
                                        onSelectFile={handleSelectFile}
                                        initialState={{
                                            expandedFolders: new Set(collectAllFolderIds(nodes)),
                                            selectedFilePath: selectedNode?.path || null
                                        }}
                                    >
                                        <Tree nodes={nodes} />
                                    </TreeProvider>
                                </div>
                                <div className="h-[300px]">
                                    <FileViewer selectedNode={selectedNode} className="h-full" />
                                </div>
                            </div>
                        ) : (
                            // Desktop: Side-by-side with resizable panels
                            <ResizablePanelGroup className="h-[400px] w-full">
                                {/* Tree Panel */}
                                <ResizablePanel
                                    defaultSize={leftPanelSize}
                                    minSize={20}
                                    collapsed={isCollapsed}
                                    className="border-r border-border"
                                >
                                    <div className="h-full overflow-auto p-2">
                                        <TreeProvider
                                            showIndentLines={showIndentLines}
                                            enableHoverHighlight={component.enableHoverHighlight}
                                            onSelectFile={handleSelectFile}
                                            initialState={{
                                                expandedFolders: new Set(collectAllFolderIds(nodes)),
                                                selectedFilePath: selectedNode?.path || null
                                            }}
                                        >
                                            <Tree nodes={nodes} />
                                        </TreeProvider>
                                    </div>
                                </ResizablePanel>

                                {/* Resize Handle */}
                                <ResizableHandle onResize={handleResize} />

                                {/* Viewer Panel */}
                                <ResizablePanel className="flex-1">
                                    <FileViewer selectedNode={selectedNode} className="h-full" />
                                </ResizablePanel>
                            </ResizablePanelGroup>
                        )
                    ) : (
                        <div className="max-h-[400px] overflow-auto p-2">
                            <TreeProvider
                                showIndentLines={showIndentLines}
                                enableHoverHighlight={component.enableHoverHighlight}
                                onSelectFile={handleSelectFile}
                            >
                                <Tree nodes={nodes} />
                            </TreeProvider>
                        </div>
                    )}

                    {/* Config Modal */}
                    <ConfigModal
                        isOpen={isConfigOpen}
                        onClose={() => setIsConfigOpen(false)}
                        component={component}
                        onSave={handleSaveConfig}
                    />
                </div>
            )
        }
    }
)



function expandAll(nodes: TNode[]): TNode[] {
    return nodes.map((node) => {
        if (node.type === 'folder' && node.children) {
            return {
                ...node,
                isExpanded: true,
                children: expandAll(node.children)
            }
        }
        return node
    })
}

function collectAllFolderIds(nodes: TNode[]): string[] {
    const ids: string[] = []
    for (const node of nodes) {
        if (node.type === 'folder') {
            ids.push(node.id)
            if (node.children) {
                ids.push(...collectAllFolderIds(node.children))
            }
        }
    }
    return ids
}
