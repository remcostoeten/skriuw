'use client'

import { BlockNoteEditor } from '@blocknote/core'
import { cn } from '@skriuw/shared'
import { Bold, Italic, Heading1, Heading2, List, CheckSquare, Quote, Code } from 'lucide-react'
import { useEffect, useState } from 'react'

type Props = {
	editor: BlockNoteEditor | null
	className?: string
}

export function MobileFormattingBar({ editor, className }: Props) {
	const [isMobile, setIsMobile] = useState(false)
	const [activeFormats, setActiveFormats] = useState<any>({})
	const [activeBlockType, setActiveBlockType] = useState<string>('paragraph')

	// Detect mobile
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768)
		checkMobile()
		window.addEventListener('resize', checkMobile)
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	// Update active state on selection change
	useEffect(() => {
		if (!editor) return

		const updateState = () => {
			const styles = editor.getActiveStyles()
			const block = editor.getTextCursorPosition().block

			setActiveFormats(styles)
			setActiveBlockType(block.type)
		}

		// Initial check
		updateState()

		// Subscribe to changes
		// BlockNote v0.15+ uses local state listeners, but we'll try to hook into the selection change
		// Since we don't have direct access to the change event listener in this scope easily without a hook,
		// we can assume the parent re-renders or we might need a `useEditor` hook features if available.
		// However, for a simple toolbar, we can use a polling or event listener approach if BlockNote exposes one.
		// Actually, BlockNote's `onSelectionChange` or `onEditorContentChange` should trigger updates.
		// But since we are receiving `editor` as a prop, we usually rely on the parent to pass down state OR
		// we attach a listener.

		// Using a simple interval for prototype or checking if editor has an onSelectionChange method we can tap into.
		// Better yet, we can attach a listener if the API supports it.
		// For now, let's just use the fact that buttons click will update state,
		// and ideally we'd want real-time updates.
		// Let's retry: BlockNote editor instance usually has `onSelectionChange`.

		return editor.onSelectionChange(updateState)
	}, [editor])

	if (!isMobile || !editor) return null

	const toggleStyle = (style: string) => {
		// @ts-ignore
		editor.toggleStyles({ [style]: true })
		editor.focus()
	}

	const toggleBlock = (type: string) => {
		const currentBlock = editor.getTextCursorPosition().block
		const currentType = currentBlock.type

		// Toggle off if already active (revert to paragraph), unless it's already paragraph
		// Note: 'heading1' is our custom key, mapped to heading level 1
		const targetType = type === 'heading1' ? 'heading' : type
		const newType =
			currentType === targetType && targetType !== 'paragraph' && type !== 'heading1'
				? 'paragraph'
				: targetType

		// For H1 specifically, if we are already H1 (heading level 1), revert to paragraph
		if (
			type === 'heading1' &&
			currentType === 'heading' &&
			(currentBlock.props as any).level === 1
		) {
			editor.updateBlock(currentBlock, { type: 'paragraph' })
			editor.focus()
			return
		}

		if (newType === 'heading') {
			editor.updateBlock(currentBlock, { type: 'heading', props: { level: 2 } })
		} else if (type === 'heading1') {
			editor.updateBlock(currentBlock, { type: 'heading', props: { level: 1 } })
		} else {
			editor.updateBlock(currentBlock, { type: newType as any })
		}
		editor.focus()
	}

	// Helper to check if a block type matches our button intent
	const isBlockActive = (type: string, props?: any) => {
		if (activeBlockType !== type) return false
		if (type === 'heading' && props) {
			const block = editor.getTextCursorPosition().block
			// @ts-ignore
			return block.props.level === props.level
		}
		return true
	}

	return (
		<div
			className={cn(
				'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
				'flex items-center gap-1 p-1.5',
				'bg-background/80 backdrop-blur-md border border-border/50 shadow-lg rounded-full',
				'transition-all duration-200 ease-out',
				// Hide when keyboard might obstruct or maybe keep it floating?
				// Usually sticky to bottom is handled by the browser moving the viewport up.
				// We'll trust `bottom-4` works relative to the visual viewport.
				className
			)}
		>
			<FormatButton
				onClick={() => toggleBlock('heading1')}
				isActive={isBlockActive('heading', { level: 1 })}
				icon={<Heading1 size={18} />}
				label='H1'
			/>
			<FormatButton
				onClick={() => toggleBlock('heading')}
				isActive={isBlockActive('heading', { level: 2 })}
				icon={<Heading2 size={18} />}
				label='H2'
			/>

			<div className='w-px h-4 bg-border/50 mx-1' />

			<FormatButton
				onClick={() => toggleStyle('bold')}
				isActive={activeFormats.bold}
				icon={<Bold size={16} />}
				label='Bold'
			/>
			<FormatButton
				onClick={() => toggleStyle('italic')}
				isActive={activeFormats.italic}
				icon={<Italic size={16} />}
				label='Italic'
			/>
			<FormatButton
				onClick={() => toggleStyle('code')}
				isActive={activeFormats.code}
				icon={<Code size={16} />}
				label='Code'
			/>

			<div className='w-px h-4 bg-border/50 mx-1' />

			<FormatButton
				onClick={() => toggleBlock('bulletListItem')}
				isActive={isBlockActive('bulletListItem')}
				icon={<List size={18} />}
				label='Bullet List'
			/>
			<FormatButton
				onClick={() => toggleBlock('checkListItem')}
				isActive={isBlockActive('checkListItem')}
				icon={<CheckSquare size={16} />}
				label='Check List'
			/>
			<FormatButton
				onClick={() => toggleBlock('blockquote')}
				isActive={isBlockActive('blockquote')}
				icon={<Quote size={16} />}
				label='Quote'
			/>
		</div>
	)
}

function FormatButton({
	onClick,
	isActive,
	icon,
	label
}: {
	onClick: () => void
	isActive?: boolean
	icon: React.ReactNode
	label: string
}) {
	return (
		<button
			type='button'
			onClick={(e) => {
				e.preventDefault() // Prevent losing focus
				onClick()
			}}
			className={cn(
				'p-2 rounded-full transition-colors',
				isActive
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted'
			)}
			aria-label={label}
		>
			{icon}
		</button>
	)
}
