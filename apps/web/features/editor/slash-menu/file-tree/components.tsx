'use client'

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
import {
	createContext,
	useContext,
	useCallback,
	useRef,
	useEffect,
	useState,
	memo,
	type ReactNode,
	type KeyboardEvent
} from 'react'
import { cn } from '@skriuw/shared'
import type { TNode, TTreeState, TIconColorMode } from './types'
import { getFileColor, getFolderColor, getFolderOpenColor } from './types'

export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type TreeContextValue = {
	state: TTreeState
	onToggleExpand: (id: string) => void
	onSelectFile: (path: string, content?: string, language?: string) => void
	showIndentLines: boolean
	enableHoverHighlight: boolean
	iconColorMode: TIconColorMode
}

const TreeContext = createContext<TreeContextValue | null>(null)

function useTreeContext() {
	const context = useContext(TreeContext)
	if (!context) {
		throw new Error('Tree components must be used within a TreeProvider')
	}
	return context
}

type TreeProviderProps = {
	children: ReactNode
	initialState?: Partial<TTreeState>
	showIndentLines?: boolean
	enableHoverHighlight?: boolean
	iconColorMode?: TIconColorMode
	onSelectFile?: (path: string, content?: string, language?: string) => void
}

export function TreeProvider({
	children,
	initialState,
	showIndentLines = true,
	enableHoverHighlight = true,
	iconColorMode = 'monochrome',
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
				enableHoverHighlight,
				iconColorMode
			}}
		>
			{children}
		</TreeContext.Provider>
	)
}

type TreeProps = {
	nodes: TNode[]
	className?: string
	ariaLabel?: string
}

export function Tree({ nodes, className, ariaLabel = 'File tree' }: TreeProps) {
	const treeRef = useRef<HTMLDivElement>(null)
	const [focusedIndex, setFocusedIndex] = useState(-1)
	const liveRegionRef = useRef<HTMLDivElement>(null)

	const { state, onToggleExpand, onSelectFile } = useTreeContext()
	const visibleNodes = getVisibleNodes(nodes, state.expandedFolders)

	const announceSelection = useCallback((name: string) => {
		if (liveRegionRef.current) {
			liveRegionRef.current.textContent = `Selected ${name}`
		}
	}, [])

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			const { key } = e
			const focusedNode = visibleNodes[focusedIndex]

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
					if (
						focusedNode?.type === 'folder' &&
						!state.expandedFolders.has(focusedNode.id)
					) {
						e.preventDefault()
						onToggleExpand(focusedNode.id)
					}
					break
				case 'ArrowLeft':
					if (
						focusedNode?.type === 'folder' &&
						state.expandedFolders.has(focusedNode.id)
					) {
						e.preventDefault()
						onToggleExpand(focusedNode.id)
					}
					break
				case 'Enter':
				case ' ':
					if (focusedNode) {
						e.preventDefault()
						if (focusedNode.type === 'folder') {
							onToggleExpand(focusedNode.id)
						} else {
							onSelectFile(
								focusedNode.path,
								focusedNode.content,
								focusedNode.language
							)
							announceSelection(focusedNode.name)
						}
					}
					break
			}
		},
		[
			visibleNodes,
			focusedIndex,
			state.expandedFolders,
			onToggleExpand,
			onSelectFile,
			announceSelection
		]
	)

	return (
		<>
			<div
				ref={treeRef}
				role='tree'
				aria-label={ariaLabel}
				aria-roledescription='file tree'
				tabIndex={0}
				className={cn(
					'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full min-w-0',
					className
				)}
				onKeyDown={handleKeyDown}
			>
				{nodes.map((node) => (
					<TreeNode
						key={node.id}
						node={node}
						depth={0}
						focusedPath={visibleNodes[focusedIndex]?.path}
						onFocus={() =>
							setFocusedIndex(visibleNodes.findIndex((n) => n.path === node.path))
						}
					/>
				))}
			</div>
			<div ref={liveRegionRef} aria-live='polite' aria-atomic='true' className='sr-only' />
		</>
	)
}

type TreeNodeProps = {
	node: TNode
	depth: number
	focusedPath?: string
	onFocus: () => void
}

const TreeNodeComponent = memo(function TreeNode({
	node,
	depth,
	focusedPath,
	onFocus
}: TreeNodeProps) {
	const {
		state,
		onToggleExpand,
		onSelectFile,
		showIndentLines,
		enableHoverHighlight,
		iconColorMode
	} = useTreeContext()
	const isExpanded = state.expandedFolders.has(node.id)
	const isSelected = state.selectedFilePath === node.path
	const isFocused = focusedPath === node.path
	const itemRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (isFocused && itemRef.current) {
			const behavior = prefersReducedMotion() ? 'auto' : 'smooth'
			itemRef.current.scrollIntoView({ block: 'nearest', behavior })
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
		<div
			role='treeitem'
			aria-expanded={node.type === 'folder' ? isExpanded : undefined}
			aria-selected={isSelected}
		>
			<div
				ref={itemRef}
				className={cn(
					'group relative flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none rounded-sm transition-colors min-h-[28px] min-w-0',
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
				{showIndentLines &&
					depth > 0 &&
					Array.from({ length: depth }).map((_, i) => (
						<span
							key={i}
							className='absolute w-px bg-border/40'
							style={{
								left: `${i * 16 + 12}px`,
								top: 0,
								bottom: 0
							}}
						/>
					))}

				{node.type === 'folder' ? (
					<button
						type='button'
						className='flex-shrink-0 p-0.5 rounded hover:bg-muted transition-colors'
						onClick={(e) => {
							e.stopPropagation()
							onToggleExpand(node.id)
						}}
						aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
					>
						{isExpanded ? (
							<ChevronDown className='w-4 h-4 text-muted-foreground' />
						) : (
							<ChevronRight className='w-4 h-4 text-muted-foreground' />
						)}
					</button>
				) : (
					<span className='w-5' />
				)}

				{node.type === 'folder' ? (
					isExpanded ? (
						<FolderOpen
							className={cn(
								'w-4 h-4 flex-shrink-0',
								getFolderOpenColor(iconColorMode)
							)}
						/>
					) : (
						<FolderIcon
							className={cn('w-4 h-4 flex-shrink-0', getFolderColor(iconColorMode))}
						/>
					)
				) : (
					<FileNodeIcon path={node.path} iconColorMode={iconColorMode} />
				)}

				<span className='truncate text-sm'>{node.name}</span>
			</div>

			{node.type === 'folder' && isExpanded && node.children && (
				<div role='group'>
					{node.children.map((child) => (
						<TreeNodeComponent
							key={child.id}
							node={child}
							depth={depth + 1}
							focusedPath={focusedPath}
							onFocus={onFocus}
						/>
					))}
				</div>
			)}
		</div>
	)
})

const TreeNode = TreeNodeComponent

const FileNodeIcon = memo(function FileNodeIcon({
	path,
	iconColorMode
}: {
	path: string
	iconColorMode: TIconColorMode
}) {
	const extension = path.split('.').pop()?.toLowerCase() || ''
	const colorClass = getFileColor(path, iconColorMode)

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
			return (
				<ImageIcon
					className={cn(
						'w-4 h-4 flex-shrink-0',
						iconColorMode === 'colored' ? 'text-purple-400' : 'text-muted-foreground'
					)}
				/>
			)
		default:
			return <FileIcon className={cn('w-4 h-4 flex-shrink-0', colorClass)} />
	}
})

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
