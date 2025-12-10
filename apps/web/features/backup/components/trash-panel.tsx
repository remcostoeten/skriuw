'use client'

import { useState, useEffect, useCallback } from 'react'
import {
	Trash2,
	RotateCcw,
	Loader2,
	AlertTriangle,
	FileText,
	Folder,
	Clock,
	Info,
} from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { useConfirmationPopover } from '@skriuw/ui/confirmation-popover'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@skriuw/shared'

import { getTrashItems, TRASH_RETENTION_DAYS } from '@/features/notes/api/queries/get-trash'
import { restoreItem } from '@/features/notes/api/mutations/restore-item'
import { permanentDeleteItem } from '@/features/notes/api/mutations/permanent-delete-item'
import { emptyTrash } from '@/features/notes/api/mutations/empty-trash'

import type { Item } from '@/features/notes/types'

function formatTimeAgo(timestamp: number): string {
	const now = Date.now()
	const diff = now - timestamp

	if (diff < 0) return 'Invalid date'

	const days = Math.floor(diff / (1000 * 60 * 60 * 24))
	const hours = Math.floor(diff / (1000 * 60 * 60))
	const minutes = Math.floor(diff / (1000 * 60))

	if (days > 0) return `${days}d ago`
	if (hours > 0) return `${hours}h ago`
	if (minutes > 0) return `${minutes}m ago`
	return 'Just now'
}

function getDaysRemaining(deletedAt: number): number {
	const now = Date.now()
	const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
	const expiresAt = deletedAt + retentionMs
	const remaining = expiresAt - now
	return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)))
}

export function TrashPanel() {
	const [trashItems, setTrashItems] = useState<Item[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [isRestoring, setIsRestoring] = useState<string | null>(null)
	const [isDeleting, setIsDeleting] = useState<string | null>(null)
	const [isEmptying, setIsEmptying] = useState(false)
	const [hoveredItem, setHoveredItem] = useState<string | null>(null)

	const { showConfirm, ConfirmationPopover } = useConfirmationPopover()

	const loadTrashItems = useCallback(async () => {
		try {
			const items = await getTrashItems()
			setTrashItems(items)
		} catch (error) {
			console.error('Failed to load trash items:', error)
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		loadTrashItems()
	}, [loadTrashItems])

	const handleRestore = async (id: string) => {
		setIsRestoring(id)
		try {
			const success = await restoreItem(id)
			if (success) {
				setTrashItems((prev) => prev.filter((item) => item.id !== id))
			}
		} catch (error) {
			console.error('Failed to restore item:', error)
		} finally {
			setIsRestoring(null)
		}
	}

	const handlePermanentDelete = (id: string, name: string) => {
		showConfirm({
			title: `Permanently delete "${name}"?`,
			description: 'This action cannot be undone. The item will be gone forever.',
			variant: 'destructive',
			confirmText: 'Delete Forever',
			cancelText: 'Cancel',
			onConfirm: async () => {
				setIsDeleting(id)
				try {
					const success = await permanentDeleteItem(id)
					if (success) {
						setTrashItems((prev) => prev.filter((item) => item.id !== id))
					}
				} catch (error) {
					console.error('Failed to permanently delete item:', error)
				} finally {
					setIsDeleting(null)
				}
			},
		})
	}

	const handleEmptyTrash = () => {
		showConfirm({
			title: 'Empty trash?',
			description: `This will permanently delete ${trashItems.length} item${trashItems.length !== 1 ? 's' : ''}. This action cannot be undone.`,
			variant: 'destructive',
			confirmText: 'Empty Trash',
			cancelText: 'Cancel',
			onConfirm: async () => {
				setIsEmptying(true)
				try {
					await emptyTrash()
					setTrashItems([])
				} catch (error) {
					console.error('Failed to empty trash:', error)
				} finally {
					setIsEmptying(false)
				}
			},
		})
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-16 gap-2 text-muted-foreground/60">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span className="text-sm">Loading...</span>
			</div>
		)
	}

	if (trashItems.length === 0) {
		return (
			<div className="py-12">
				<EmptyState
					message="Trash is empty"
					isError={`Deleted notes will appear here for ${TRASH_RETENTION_DAYS} days`}
					icon={<Trash2 className="h-8 w-8" />}
					isFull
				/>
			</div>
		)
	}

	// Group items by urgency
	const expiringItems = trashItems.filter((item) => {
		if (!item.deletedAt) return false
		return getDaysRemaining(item.deletedAt) <= 3
	})
	const normalItems = trashItems.filter((item) => {
		if (!item.deletedAt) return true
		return getDaysRemaining(item.deletedAt) > 3
	})

	return (
		<div className="space-y-6">
			{/* Header section */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 text-sm">
						<span className="font-medium text-foreground">{trashItems.length}</span>
						<span className="text-muted-foreground">item{trashItems.length !== 1 ? 's' : ''}</span>
					</div>
					{expiringItems.length > 0 && (
						<div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-500 text-xs font-medium">
							<AlertTriangle className="h-3 w-3" />
							{expiringItems.length} expiring soon
						</div>
					)}
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={handleEmptyTrash}
					disabled={isEmptying}
					ripple
					rippleColor="rgba(239, 68, 68, 0.3)"
					className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5 rounded-none"
				>
					{isEmptying ? (
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
					) : (
						<Trash2 className="h-4 w-4 mr-2" />
					)}
					Empty Trash
				</Button>
			</div>

			{/* Info banner */}
			<div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border/50 text-xs text-muted-foreground">
				<Info className="h-3.5 w-3.5 shrink-0" />
				<span>
					Items are automatically deleted after {TRASH_RETENTION_DAYS} days. Restore items to keep
					them.
				</span>
			</div>

			{/* Expiring soon section */}
			{expiringItems.length > 0 && (
				<div className="space-y-2">
					<h4 className="text-xs font-medium text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
						<Clock className="h-3 w-3" />
						Expiring Soon
					</h4>
					<div className="space-y-1.5">
						{expiringItems.map((item) => (
							<TrashItem
								key={item.id}
								item={item}
								isHovered={hoveredItem === item.id}
								onHover={(hovered) => setHoveredItem(hovered ? item.id : null)}
								isRestoring={isRestoring === item.id}
								isDeleting={isDeleting === item.id}
								onRestore={() => handleRestore(item.id)}
								onDelete={() => handlePermanentDelete(item.id, item.name)}
								variant="warning"
							/>
						))}
					</div>
				</div>
			)}

			{/* Normal items section */}
			{normalItems.length > 0 && (
				<div className="space-y-2">
					{expiringItems.length > 0 && (
						<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Other Items
						</h4>
					)}
					<div className="space-y-1.5">
						{normalItems.map((item) => (
							<TrashItem
								key={item.id}
								item={item}
								isHovered={hoveredItem === item.id}
								onHover={(hovered) => setHoveredItem(hovered ? item.id : null)}
								isRestoring={isRestoring === item.id}
								isDeleting={isDeleting === item.id}
								onRestore={() => handleRestore(item.id)}
								onDelete={() => handlePermanentDelete(item.id, item.name)}
							/>
						))}
					</div>
				</div>
			)}

			<ConfirmationPopover />
		</div>
	)
}

// Individual trash item component
interface TrashItemProps {
	item: Item
	isHovered: boolean
	onHover: (hovered: boolean) => void
	isRestoring: boolean
	isDeleting: boolean
	onRestore: () => void
	onDelete: () => void
	variant?: 'default' | 'warning'
}

function TrashItem({
	item,
	isHovered,
	onHover,
	isRestoring,
	isDeleting,
	onRestore,
	onDelete,
	variant = 'default',
}: TrashItemProps) {
	const deletedAt = item.deletedAt
	const daysRemaining = deletedAt ? getDaysRemaining(deletedAt) : null

	return (
		<div
			onMouseEnter={() => onHover(true)}
			onMouseLeave={() => onHover(false)}
			className={cn(
				'group relative flex items-center gap-3 p-3 border transition-colors',
				variant === 'warning'
					? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
					: 'border-border/50 bg-muted/20 hover:bg-muted/40',
				isHovered && 'shadow-sm'
			)}
		>
			{/* Icon */}
			<div
				className={cn(
					'shrink-0 p-2 transition-colors',
					variant === 'warning'
						? 'bg-amber-500/10 text-amber-500'
						: 'bg-muted/50 text-muted-foreground'
				)}
			>
				{item.type === 'folder' ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0">
				<div className="font-medium truncate text-sm">{item.name}</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
					<span>{deletedAt ? formatTimeAgo(deletedAt) : 'Unknown'}</span>
					{daysRemaining !== null && (
						<>
							<span className="text-muted-foreground/50">•</span>
							<span className={cn(variant === 'warning' && 'text-amber-500')}>
								{daysRemaining}d left
							</span>
						</>
					)}
				</div>
			</div>

			{/* Actions - visible on hover */}
			<div
				className={cn(
					'flex items-center gap-1 shrink-0 transition-opacity duration-200',
					isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
				)}
			>
				<Button
					variant="ghost"
					size="sm"
					onClick={onRestore}
					disabled={isRestoring}
					className="h-7 px-2 text-xs rounded-none"
				>
					{isRestoring ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<>
							<RotateCcw className="h-3.5 w-3.5 mr-1" />
							Restore
						</>
					)}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onDelete}
					disabled={isDeleting}
					className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-none"
				>
					{isDeleting ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Trash2 className="h-3.5 w-3.5" />
					)}
				</Button>
			</div>
		</div>
	)
}
