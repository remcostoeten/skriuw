'use client'

import React from 'react'

import type { PreviewProps } from '../types'

type TreeNode = {
	id: string
	label: string
	isFolder?: boolean
	children?: TreeNode[]
	count?: number
}

const SAMPLE_TREE: TreeNode[] = [
	{
		id: 'bugs',
		label: 'Bugs',
		isFolder: true,
		count: 2,
		children: [
			{
				id: 'bug-1',
				label: 'New Folder',
				isFolder: true,
				count: 2,
				children: [
					{ id: 'bug-1-1', label: 'Untitled' },
					{ id: 'bug-1-2', label: 'Mobile focus after c…' },
				],
			},
		],
	},
	{
		id: 'folder-2',
		label: 'New Folder',
		isFolder: true,
		count: 1,
		children: [{ id: 'folder-2-1', label: 'Untitled' }],
	},
	{ id: 'untitled-3', label: 'Untitled' },
]

export default function SidebarTreePreview({ value }: PreviewProps<boolean>) {
	return (
		<div className="mt-3 rounded-md overflow-hidden border border-border">
			<div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
				<span>Sidebar Tree Preview</span>
				<span className="font-medium">{value ? 'Guides On' : 'Guides Off'}</span>
			</div>
			<div className="bg-background-secondary p-3">
				<div className="bg-background border border-border/70 rounded-md p-3">
					<div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
						Notes
					</div>
					<div className="space-y-1">
						{SAMPLE_TREE.map((node, index) => (
							<TreeRow
								key={node.id}
								node={node}
								depth={0}
								ancestorsLast={[]}
								isLast={index === SAMPLE_TREE.length - 1}
								showGuides={value}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	)
}

function TreeRow({
	node,
	depth,
	ancestorsLast,
	isLast,
	showGuides,
}: {
	node: TreeNode
	depth: number
	ancestorsLast: boolean[]
	isLast: boolean
	showGuides: boolean
}) {
	const hasChildren = node.children && node.children.length > 0

	return (
		<div className="space-y-1">
			<div className="flex items-start">
				{Array.from({ length: depth }).map((_, idx) => {
					const isAncestorLast = ancestorsLast[idx]
					return (
						<div key={idx} className="relative w-4">
							{showGuides && !isAncestorLast && (
								<div className="absolute left-2 top-0 bottom-0 border-l border-border/60" />
							)}
						</div>
					)
				})}
				<div className="relative flex-1">
					{showGuides && depth > 0 && (
						<div className="absolute -left-4 top-3 w-4 border-t border-border/60" />
					)}
					<div
						className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs leading-none bg-transparent hover:bg-muted/30 transition-colors"
						style={{ paddingLeft: hasChildren ? 0 : undefined }}
					>
						<div className="flex items-center gap-2 min-w-0">
							{node.isFolder ? (
								<div className="w-4 h-4 rounded-sm bg-muted-foreground/20 border border-border/60 flex items-center justify-center text-[10px] text-muted-foreground">
									📁
								</div>
							) : (
								<div className="w-4 h-4 rounded-sm bg-muted-foreground/15 border border-border/60 flex items-center justify-center text-[10px] text-muted-foreground">
									📄
								</div>
							)}
							<span className="truncate text-foreground">{node.label}</span>
						</div>
						{node.count !== undefined && (
							<span className="text-[11px] text-muted-foreground font-medium">
								{node.count}
							</span>
						)}
					</div>
				</div>
			</div>
			{hasChildren && (
				<div className="space-y-1">
					{node.children!.map((child, index) => (
						<TreeRow
							key={child.id}
							node={child}
							depth={depth + 1}
							ancestorsLast={[...ancestorsLast, isLast]}
							isLast={index === node.children!.length - 1}
							showGuides={showGuides}
						/>
					))}
				</div>
			)}
		</div>
	)
}
