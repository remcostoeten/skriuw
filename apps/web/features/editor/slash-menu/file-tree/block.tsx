'use client'

import { createReactBlockSpec } from '@blocknote/react'
import { useState, useCallback, useEffect, useMemo, useDeferredValue } from 'react'
import { Settings, Folder, Lock, Unlock, Palette, ChevronsUpDown, Search, X } from 'lucide-react'
import { cn } from '@skriuw/shared'
import type { TComponent, TNode, TStyle, TIconColorMode } from './types'
import {
	buildTreeFromFiles,
	flattenTreeToFiles,
	findNodeByPath,
	DEFAULT_TREE_FILES,
	countFiles,
	filterTreeByQuery
} from './utils'
import { getLanguageFromPath, getFolderColor } from './types'
import { TreeProvider, Tree, prefersReducedMotion } from './components'
import { FileViewer, ResizablePanelGroup, ResizablePanel, ResizableHandle } from './viewer'
import { ConfigModal } from './config-modal'

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
			content: {
				default: JSON.stringify(DEFAULT_COMPONENT)
			},
			style: {
				default: 'full' as TStyle
			},
			showIndentLines: {
				default: true
			},
			initialExpandedAll: {
				default: true
			},
			locked: {
				default: false
			},
			iconColorMode: {
				default: 'monochrome' as TIconColorMode
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
			const iconColorMode = (block.props.iconColorMode as TIconColorMode) || 'monochrome'

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
			const [searchQuery, setSearchQuery] = useState('')
			const deferredQuery = useDeferredValue(searchQuery)
			const isStale = searchQuery !== deferredQuery
			const [isSearchOpen, setIsSearchOpen] = useState(false)
			const isCollapsed = leftPanelSize === 0

			const isMobile = useIsMobile()
			const reducedMotion = usePrefersReducedMotion()

			useEffect(() => {
				const tree = buildTreeFromFiles(component.files)
				setNodes(block.props.initialExpandedAll ? expandAll(tree) : tree)
			}, [component.files, block.props.initialExpandedAll])

			const filteredNodes = useMemo(
				() => filterTreeByQuery(nodes, deferredQuery),
				[nodes, deferredQuery]
			)

			const fileCount = useMemo(() => countFiles(nodes), [nodes])

			const handleSelectFile = useCallback(
				(path: string, _content?: string, _language?: string) => {
					const node = findNodeByPath(nodes, path)
					if (node) {
						setSelectedNode(node)
					}
				},
				[nodes]
			)

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

			const toggleStyle = useCallback(() => {
				if (isLocked) return
				const styles: TStyle[] = ['full', 'card', 'minimal']
				const currentIndex = styles.indexOf(style)
				const nextStyle = styles[(currentIndex + 1) % styles.length]
				editor.updateBlock(block.id, {
					props: { ...block.props, style: nextStyle }
				})
			}, [editor, block.id, style, block.props, isLocked])

			const toggleLock = useCallback(() => {
				editor.updateBlock(block.id, {
					props: { ...block.props, locked: !isLocked }
				})
			}, [editor, block.id, block.props, isLocked])

			const toggleIconColorMode = useCallback(() => {
				if (isLocked) return
				const nextMode: TIconColorMode =
					iconColorMode === 'monochrome' ? 'colored' : 'monochrome'
				editor.updateBlock(block.id, {
					props: { ...block.props, iconColorMode: nextMode }
				})
			}, [editor, block.id, block.props, isLocked, iconColorMode])

			const toggleExpandAll = useCallback(() => {
				const allExpanded = nodes.every((n) => n.type !== 'folder' || n.isExpanded)
				setNodes(allExpanded ? collapseAll(nodes) : expandAll(nodes))
			}, [nodes])

			const handleResize = useCallback((delta: number) => {
				setLeftPanelSize((prev) => {
					const newSize = prev + delta / 10
					if (newSize < 15) return 0
					return Math.max(20, Math.min(70, newSize))
				})
			}, [])

			const containerClasses = cn(
				'relative group my-4 overflow-hidden w-full',
				style === 'full' && 'rounded-lg border border-border bg-card shadow-sm',
				style === 'card' && 'rounded-lg border border-border bg-card/50',
				style === 'minimal' && '',
				!reducedMotion && 'transition-all duration-200',
				isLocked && 'ring-1 ring-amber-500/30'
			)

			const treeContent = (
				<div className={cn('transition-opacity duration-200', isStale && 'opacity-50')}>
					<TreeProvider
						key={`${iconColorMode}-${showIndentLines}`}
						showIndentLines={showIndentLines}
						enableHoverHighlight={component.enableHoverHighlight}
						iconColorMode={iconColorMode}
						onSelectFile={handleSelectFile}
						initialState={{
							expandedFolders: new Set(collectAllFolderIds(filteredNodes)),
							selectedFilePath: selectedNode?.path || null
						}}
					>
						<Tree nodes={filteredNodes} />
					</TreeProvider>
				</div>
			)

			return (
				<div className={containerClasses}>
					<div className='absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
						<button
							type='button'
							onClick={toggleLock}
							className={cn(
								'p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm',
								isLocked && 'bg-amber-500/20 border-amber-500/50'
							)}
							title={isLocked ? 'Unlock file tree' : 'Lock file tree (view-only)'}
							aria-label={isLocked ? 'Unlock file tree' : 'Lock file tree'}
						>
							{isLocked ? (
								<Lock className='w-4 h-4 text-amber-500' />
							) : (
								<Unlock className='w-4 h-4 text-muted-foreground' />
							)}
						</button>
						{!isLocked && (
							<>
								<button
									type='button'
									onClick={toggleIconColorMode}
									className='p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm'
									title={`Icons: ${iconColorMode}. Click to toggle.`}
									aria-label={`Toggle icon color mode (currently ${iconColorMode})`}
								>
									<Palette className='w-4 h-4 text-muted-foreground' />
								</button>
								<button
									type='button'
									onClick={toggleExpandAll}
									className='p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm'
									title='Collapse/Expand all'
									aria-label='Toggle collapse and expand all folders'
								>
									<ChevronsUpDown className='w-4 h-4 text-muted-foreground' />
								</button>
								<button
									type='button'
									onClick={() => setIsSearchOpen((prev) => !prev)}
									className='p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm'
									title='Search files'
									aria-label='Toggle file search'
								>
									<Search className='w-4 h-4 text-muted-foreground' />
								</button>
								<button
									type='button'
									onClick={() => setIsConfigOpen(true)}
									className='p-1.5 bg-background/80 backdrop-blur-sm border border-border hover:bg-muted rounded-md transition-colors shadow-sm'
									title='Configure file tree'
									aria-label='Configure file tree'
								>
									<Settings className='w-4 h-4 text-muted-foreground' />
								</button>
							</>
						)}
					</div>

					{(style === 'full' || style === 'card') && (
						<div className='flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30'>
							<div className='flex items-center gap-2'>
								<Folder className={cn('w-4 h-4', getFolderColor(iconColorMode))} />
								<span className='text-sm font-medium'>{component.name}</span>
								{component.version && (
									<span className='text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
										v{component.version}
									</span>
								)}
								<span className='text-xs text-muted-foreground'>
									{fileCount} {fileCount === 1 ? 'file' : 'files'}
								</span>
							</div>
						</div>
					)}

					{isSearchOpen && (
						<div className='flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20'>
							<Search className='w-4 h-4 text-muted-foreground flex-shrink-0' />
							<input
								type='text'
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder='Filter files...'
								className='flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/50'
								autoFocus
								aria-label='Filter files in tree'
							/>
							{searchQuery && (
								<button
									type='button'
									onClick={() => setSearchQuery('')}
									className='p-0.5 hover:bg-muted rounded transition-colors'
									aria-label='Clear search'
								>
									<X className='w-3.5 h-3.5 text-muted-foreground' />
								</button>
							)}
						</div>
					)}

					{style === 'full' ? (
						isMobile ? (
							<div className='flex flex-col'>
								<div className='max-h-[200px] overflow-auto p-2 border-b border-border'>
									{treeContent}
								</div>
								<div className='h-[300px]'>
									<FileViewer selectedNode={selectedNode} className='h-full' />
								</div>
							</div>
						) : (
							<ResizablePanelGroup className='h-[400px] w-full'>
								<ResizablePanel
									defaultSize={leftPanelSize}
									minSize={20}
									collapsed={isCollapsed}
									className='border-r border-border'
								>
									<div className='h-full overflow-auto p-2'>{treeContent}</div>
								</ResizablePanel>

								<ResizableHandle onResize={handleResize} />

								<ResizablePanel
									defaultSize={100 - leftPanelSize}
									className='min-w-0'
								>
									<FileViewer selectedNode={selectedNode} className='h-full' />
								</ResizablePanel>
							</ResizablePanelGroup>
						)
					) : (
						<div className='max-h-[400px] overflow-auto p-2'>{treeContent}</div>
					)}

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

function collapseAll(nodes: TNode[]): TNode[] {
	return nodes.map((node) => {
		if (node.type === 'folder' && node.children) {
			return {
				...node,
				isExpanded: false,
				children: collapseAll(node.children)
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
