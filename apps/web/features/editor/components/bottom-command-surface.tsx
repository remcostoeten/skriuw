'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { cn } from '@skriuw/shared'
import type { PartialBlock, BlockNoteEditor } from '@blocknote/core'

type Point = {
	x: number
	y: number
}

export type SurfaceContext = {
	editor: BlockNoteEditor | null
	noteId: string
	cursor?: Point | null
}

export type BlockKind = 'heading' | 'bullet' | 'check' | 'code' | 'divider'

type Menu = 'root' | 'blocks' | 'link'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	context: SurfaceContext
	onCreate: (context: SurfaceContext) => Promise<void> | void
	onInsert: (kind: BlockKind, context: SurfaceContext) => void
	onLink: (url: string, context: SurfaceContext) => void
	onNotes: () => void
	onFiles: () => void
	onArchive: (context: SurfaceContext) => Promise<void> | void
	onDelete: (context: SurfaceContext) => Promise<void> | void
	className?: string
}

type DragState = {
	active: boolean
	pointerId: number | null
	startY: number
	startTime: number
}

const handleHeight = 28
const maxDrag = 180
const openThreshold = 64
const closeThreshold = 72
const velocityThreshold = 0.35

export function CommandSurface({
	open,
	onOpenChange,
	context,
	onCreate,
	onInsert,
	onLink,
	onNotes,
	onFiles,
	onArchive,
	onDelete,
	className,
}: Props) {
	const [menu, setMenu] = useState<Menu>('root')
	const [linkValue, setLinkValue] = useState('')
	const [dragOffset, setDragOffset] = useState(0)
	const [isDragging, setIsDragging] = useState(false)
	const dragRef = useRef<DragState>({
		active: false,
		pointerId: null,
		startY: 0,
		startTime: 0,
	})

	const canEdit = Boolean(context.editor)

	const baseOffset = open ? '0px' : `calc(100% - ${handleHeight}px)`

	const sheetStyle = useMemo(function sheetStyle() {
		return {
			'--sheet-offset': baseOffset,
			'--drag-offset': `${dragOffset}px`,
		} as CSSProperties
	}, [baseOffset, dragOffset])

	useEffect(function resetMenu() {
		if (!open) {
			setMenu('root')
			setLinkValue('')
		}
	}, [open])

	useEffect(function handleKeys() {
		if (!open) return undefined

		function handleKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				onOpenChange(false)
			}
		}

		window.addEventListener('keydown', handleKey)
		return function cleanup() {
			window.removeEventListener('keydown', handleKey)
		}
	}, [open, onOpenChange])

	const handleAction = useCallback(
		function handleAction(event: React.MouseEvent<HTMLButtonElement>) {
			const action = event.currentTarget.dataset.action
			if (!action) return

			if (action === 'insert') {
				setMenu('blocks')
				return
			}

			if (action === 'link') {
				setMenu('link')
				return
			}

			if (action === 'create') {
				onCreate(context)
			}

			if (action === 'notes') {
				onNotes()
			}

			if (action === 'files') {
				onFiles()
			}

			if (action === 'archive') {
				onArchive(context)
			}

			if (action === 'delete') {
				onDelete(context)
			}

			onOpenChange(false)
		},
		[context, onArchive, onCreate, onDelete, onFiles, onNotes, onOpenChange]
	)

	const handleBack = useCallback(function handleBack() {
		setMenu('root')
	}, [])

	const handleBlock = useCallback(
		function handleBlock(event: React.MouseEvent<HTMLButtonElement>) {
			const kind = event.currentTarget.dataset.kind as BlockKind | undefined
			if (!kind) return
			onInsert(kind, context)
			onOpenChange(false)
			setMenu('root')
		},
		[context, onInsert, onOpenChange]
	)

	const handleLinkChange = useCallback(function handleLinkChange(
		event: React.ChangeEvent<HTMLInputElement>
	) {
		setLinkValue(event.target.value)
	}, [])

	const handleLinkSubmit = useCallback(
		function handleLinkSubmit(event: React.FormEvent<HTMLFormElement>) {
			event.preventDefault()
			const trimmed = linkValue.trim()
			if (!trimmed) return
			onLink(trimmed, context)
			setLinkValue('')
			setMenu('root')
			onOpenChange(false)
		},
		[context, linkValue, onLink, onOpenChange]
	)

	const startDrag = useCallback(
		function startDrag(event: React.PointerEvent<HTMLDivElement>) {
			if (event.pointerType === 'mouse' && event.button !== 0) return
			event.currentTarget.setPointerCapture(event.pointerId)
			dragRef.current = {
				active: true,
				pointerId: event.pointerId,
				startY: event.clientY,
				startTime: performance.now(),
			}
			setIsDragging(true)
		},
		[]
	)

	const moveDrag = useCallback(
		function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
			if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return
			const delta = event.clientY - dragRef.current.startY
			if (open) {
				const next = clamp(delta, 0, maxDrag)
				setDragOffset(next)
				return
			}
			const next = clamp(delta, -maxDrag, 0)
			setDragOffset(next)
		},
		[open]
	)

	const endDrag = useCallback(
		function endDrag(event: React.PointerEvent<HTMLDivElement>) {
			if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return
			event.currentTarget.releasePointerCapture(event.pointerId)
			const delta = event.clientY - dragRef.current.startY
			const elapsed = Math.max(performance.now() - dragRef.current.startTime, 1)
			const velocity = delta / elapsed

			if (!open) {
				if (delta < -openThreshold || velocity < -velocityThreshold) {
					onOpenChange(true)
				}
			} else if (delta > closeThreshold || velocity > velocityThreshold) {
				onOpenChange(false)
			}

			setDragOffset(0)
			setIsDragging(false)
			dragRef.current = {
				active: false,
				pointerId: null,
				startY: 0,
				startTime: 0,
			}
		},
		[onOpenChange, open]
	)

	const handleToggle = useCallback(
		function handleToggle() {
			if (isDragging) return
			onOpenChange(!open)
		},
		[isDragging, onOpenChange, open]
	)

	const handleClose = useCallback(
		function handleClose() {
			onOpenChange(false)
		},
		[onOpenChange]
	)

	const rootItems = useMemo(
		function rootItems() {
			return [
				{ key: 'create', label: 'Create new note' },
				{ key: 'insert', label: 'Insert block', disabled: !canEdit },
				{ key: 'link', label: 'Insert link', disabled: !canEdit },
				{ key: 'notes', label: 'Navigate to Notes' },
				{ key: 'files', label: 'Navigate to Files' },
				{ key: 'archive', label: 'Archive note' },
				{ key: 'delete', label: 'Delete note' },
			]
		},
		[canEdit]
	)

	const blockItems = useMemo(function blockItems() {
		return [
			{ key: 'heading', label: 'Heading' },
			{ key: 'bullet', label: 'Bullet list' },
			{ key: 'check', label: 'Checkbox' },
			{ key: 'code', label: 'Code block' },
			{ key: 'divider', label: 'Divider' },
		]
	}, [])

	return (
		<div className={cn('fixed inset-0 z-[80]', className)}>
			<button
				type="button"
				aria-hidden={!open}
				tabIndex={open ? 0 : -1}
				onClick={handleClose}
				className={cn(
					'fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200',
					open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
					isDragging && 'transition-none'
				)}
			/>
			<div
				className={cn(
					'fixed inset-x-0 bottom-0 pointer-events-auto',
					'transition-transform duration-200 ease-out',
					isDragging && 'transition-none'
				)}
				style={{
					transform: 'translate3d(0, calc(var(--sheet-offset) + var(--drag-offset)), 0)',
					...sheetStyle,
				}}
				role="dialog"
				aria-modal="true"
				aria-hidden={!open}
			>
				<div
					className="flex items-center justify-center"
					onPointerDown={startDrag}
					onPointerMove={moveDrag}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
				>
					<button
						type="button"
						onClick={handleToggle}
						className="h-7 w-12 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm"
						aria-label={open ? 'Close command surface' : 'Open command surface'}
					/>
				</div>
				<div className="mt-3 rounded-t-2xl border-t border-white/10 bg-[#0b0b0b]/95 backdrop-blur-xl px-4 pb-6 pt-2">
					{menu === 'root' && (
						<div className="flex flex-col gap-2">
							{rootItems.map(function renderItem(item) {
								return (
									<button
										key={item.key}
										type="button"
										data-action={item.key}
										onClick={handleAction}
										disabled={item.disabled}
										className={cn(
											'flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/90',
											'transition-transform duration-150 ease-out active:scale-[0.99]',
											item.disabled && 'opacity-40 pointer-events-none'
										)}
									>
										<span>{item.label}</span>
									</button>
								)
							})}
						</div>
					)}
					{menu === 'blocks' && (
						<div className="flex flex-col gap-2">
							<button
								type="button"
								onClick={handleBack}
								className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50"
							>
								Back
							</button>
							{blockItems.map(function renderItem(item) {
								return (
									<button
										key={item.key}
										type="button"
										data-kind={item.key}
										onClick={handleBlock}
										className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/90 transition-transform duration-150 ease-out active:scale-[0.99]"
									>
										<span>{item.label}</span>
									</button>
								)
							})}
						</div>
					)}
					{menu === 'link' && (
						<form onSubmit={handleLinkSubmit} className="flex flex-col gap-3">
							<button
								type="button"
								onClick={handleBack}
								className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50"
							>
								Back
							</button>
							<label className="flex flex-col gap-2 text-sm text-white/70">
								<span>Link URL</span>
								<input
									type="url"
									inputMode="url"
									placeholder="https://"
									value={linkValue}
									onChange={handleLinkChange}
									className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white/90 outline-none focus:border-white/30"
								/>
							</label>
							<button
								type="submit"
								disabled={!linkValue.trim()}
								className="h-11 rounded-xl border border-white/10 bg-white/10 text-sm text-white/90 transition-transform duration-150 ease-out active:scale-[0.99] disabled:opacity-40"
							>
								Insert link
							</button>
						</form>
					)}
				</div>
			</div>
		</div>
	)
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

export function createBlock(kind: BlockKind): PartialBlock {
	if (kind === 'heading') {
		return {
			type: 'heading',
			props: { level: 2 },
			content: [],
			children: [],
		}
	}
	if (kind === 'bullet') {
		return {
			type: 'bulletListItem',
			content: [],
			children: [],
		}
	}
	if (kind === 'check') {
		return {
			type: 'checkListItem',
			props: { checked: false },
			content: [],
			children: [],
		}
	}
	if (kind === 'code') {
		return {
			type: 'codeBlock',
			props: {},
			content: [],
			children: [],
		}
	}
	return {
		type: 'divider',
		content: [],
		children: [],
	}
}
