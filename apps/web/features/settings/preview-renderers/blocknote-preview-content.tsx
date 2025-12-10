'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { PartialBlock } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/style.css'
import { BlockNoteView } from '@/features/editor/components/blocknote-shadcn/BlockNoteView'
import { generateId } from '@skriuw/core-logic'

// Sample content for BlockNote preview
const SAMPLE_BLOCKS: PartialBlock[] = [
	{
		type: 'paragraph',
		content: [
			{
				type: 'text',
				text: 'Try typing ',
				styles: {},
			},
			{
				type: 'text',
				text: '@',
				styles: {},
			},
			{
				type: 'text',
				text: ' to mention a note, or start with ',
				styles: {},
			},
			{
				type: 'text',
				text: '/',
				styles: {},
			},
			{
				type: 'text',
				text: ' for slash commands!',
				styles: {},
			},
		],
	},
	{
		type: 'paragraph',
		content: [
			{
				type: 'text',
				text: 'You can also create ',
				styles: {},
			},
			{
				type: 'text',
				text: 'rich text formatting',
				styles: { bold: true },
			},
			{
				type: 'text',
				text: ' with ',
				styles: {},
			},
			{
				type: 'text',
				text: 'inline code',
				styles: { code: true },
			},
			{
				type: 'text',
				text: ' and more.',
				styles: {},
			},
		],
	},
	{
		type: 'heading',
		props: { level: 2 },
		content: [
			{
				type: 'text',
				text: 'Interactive Features',
				styles: {},
			},
		],
	},
	{
		type: 'bulletListItem',
		content: [
			{
				type: 'text',
				text: 'Drag the ⋮⋮ handle to reorder blocks',
				styles: {},
			},
		],
	},
	{
		type: 'bulletListItem',
		content: [
			{
				type: 'text',
				text: 'Hover over blocks to see the drag handle',
				styles: {},
			},
		],
	},
	{
		type: 'bulletListItem',
		content: [
			{
				type: 'text',
				text: 'Type @ for note mentions (if available)',
				styles: {},
			},
		],
	},
]

export interface BlockNotePreviewContentProps {
	value: boolean
}

export default function BlockNotePreviewContent({ value }: BlockNotePreviewContentProps) {
	const [isHovering, setIsHovering] = useState(false)
	const [currentDemo, setCurrentDemo] = useState<'idle' | 'typing' | 'slash' | 'drag'>('idle')
	const demoTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const editorInitializedRef = useRef(false)
	const instanceId = useMemo(() => generateId('blocknote-'), [])

	// Create a read-only editor for preview with stable reference
	// Use a stable key to prevent duplicate instances in React Strict Mode
	const editor = useCreateBlockNote(
		{
			initialContent: SAMPLE_BLOCKS,
			uploadFile: async () => {
				// Return a placeholder URL for uploaded files
				return Promise.resolve('/placeholder.png')
			},
		},
		[]
	)

	// Prevent duplicate editor initialization
	useEffect(() => {
		if (editor && !editorInitializedRef.current) {
			editorInitializedRef.current = true
		}
		return () => {
			editorInitializedRef.current = false
		}
	}, [editor])

	// Auto-demo functionality
	useEffect(() => {
		if (isHovering) {
			// Cycle through different demos
			const demos: Array<'idle' | 'typing' | 'slash' | 'drag'> = ['typing', 'slash', 'drag']
			let index = 0

			const cycleDemos = () => {
				setCurrentDemo(demos[index])
				index = (index + 1) % demos.length
			}

			// Start first demo after a short delay
			demoTimeoutRef.current = setTimeout(cycleDemos, 500)

			// Cycle through demos
			const interval = setInterval(cycleDemos, 3000)

			return () => {
				if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current)
				clearInterval(interval)
			}
		} else {
			setCurrentDemo('idle')
			if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current)
		}
	}, [isHovering])

	const getDemoHint = () => {
		switch (currentDemo) {
			case 'typing':
				return '💡 Type @ anywhere to mention notes'
			case 'slash':
				return '💡 Type / for slash commands'
			case 'drag':
				return '💡 Drag the ⋮⋮ handle to reorder blocks'
			default:
				return '💡 Hover to see interactive features'
		}
	}

	return (
		<div
			className="mt-3 rounded-md overflow-hidden border border-border transition-all duration-200"
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
		>
			<div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
				<span>BlockNote Editor Preview</span>
				<span className="font-medium">{value ? 'Enabled' : 'Disabled'}</span>
			</div>

			{/* Demo hints */}
			<div
				className="text-xs px-3 py-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-border/50 text-blue-600 dark:text-blue-400 transition-all duration-500"
				style={{
					opacity: isHovering ? 1 : 0.7,
					transform: isHovering ? 'translateY(0)' : 'translateY(-2px)',
				}}
			>
				{getDemoHint()}
			</div>

			{/* Editor preview */}
			<div
				className={`relative bg-background-secondary transition-all duration-300 ${isHovering ? 'shadow-lg' : ''}`}
				style={{
					height: isHovering ? '280px' : '200px',
					opacity: value ? 1 : 0.3,
					pointerEvents: value ? 'auto' : ('none' as const),
				}}
			>
				{value && editor ? (
					<div className="h-full overflow-hidden">
						<BlockNoteView
							key={instanceId}
							// @ts-ignore // Type mismatch due to BlockNote version differences
							editor={editor}
							editable={false} // Read-only for preview
							theme={'light'}
							className="h-full"
							data-theming-css-variables={false}
						/>

						{/* Interactive overlay for hover effects */}
						{isHovering && (
							<div className="absolute inset-0 pointer-events-none">
								{/* Animated highlight effect */}
								<div
									className="absolute top-8 left-4 right-4 h-8 bg-blue-500/10 rounded-md border border-blue-500/20 animate-pulse"
									style={{
										animation: 'slideIn 0.5s ease-out, pulse 2s infinite',
									}}
								/>
							</div>
						)}
					</div>
				) : (
					<div className="h-full flex items-center justify-center text-muted-foreground">
						<div className="text-center">
							<div className="text-4xl mb-2">📝</div>
							<div className="text-sm">BlockNote Editor Disabled</div>
						</div>
					</div>
				)}
			</div>

			{/* Feature highlights */}
			{isHovering && value && (
				<div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
					<div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
						<span className="font-medium">@</span>
						<span>Note Mentions</span>
					</div>
					<div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
						<span className="font-medium">/</span>
						<span>Slash Commands</span>
					</div>
					<div className="flex items-center gap-1 text-green-600 dark:text-green-400">
						<span className="font-medium">⋮⋮</span>
						<span>Drag & Drop</span>
					</div>
				</div>
			)}

			<style jsx>{`
				@keyframes slideIn {
					from {
						opacity: 0;
						transform: translateY(-10px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
			`}</style>
		</div>
	)
}
