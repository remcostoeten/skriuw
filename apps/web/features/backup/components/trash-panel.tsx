'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trash2, RotateCcw, Loader2, AlertTriangle, FileText, Folder } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { useConfirmationPopover } from '@skriuw/ui/confirmation-popover'
import { cn } from '@skriuw/core-logic'

import { getTrashItems, TRASH_RETENTION_DAYS } from '@/features/notes/api/queries/get-trash'
import { restoreItem } from '@/features/notes/api/mutations/restore-item'
import { permanentDeleteItem } from '@/features/notes/api/mutations/permanent-delete-item'
import { emptyTrash } from '@/features/notes/api/mutations/empty-trash'

import type { Item } from '@/features/notes/types'

function formatTimeAgo(timestamp: number): string {
	const now = Date.now()
	const diff = now - timestamp
	const days = Math.floor(diff / (1000 * 60 * 60 * 24))
	const hours = Math.floor(diff / (1000 * 60 * 60))
	const minutes = Math.floor(diff / (1000 * 60))

	if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`
	if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
	if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
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
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (trashItems.length === 0) {
		return (
			<div className="text-center py-12 border border-dashed border-border rounded-lg">
				<Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
				<p className="text-muted-foreground">Trash is empty</p>
				<p className="text-sm text-muted-foreground mt-2">
					Deleted notes will appear here for {TRASH_RETENTION_DAYS} days
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{/* Header with empty trash button */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{trashItems.length} item{trashItems.length !== 1 ? 's' : ''} in trash
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={handleEmptyTrash}
					disabled={isEmptying}
					className="text-destructive hover:text-destructive"
				>
					{isEmptying ? (
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
					) : (
						<Trash2 className="h-4 w-4 mr-2" />
					)}
					Empty Trash
				</Button>
			</div>

			{/* Trash items list */}
			<div className="space-y-2">
				{trashItems.map((item) => {
					const daysRemaining = getDaysRemaining(item.deletedAt!)
					const isExpiringSoon = daysRemaining <= 3

					return (
						<div
							key={item.id}
							className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
						>
							{/* Icon */}
							<div className="shrink-0 text-muted-foreground">
								{item.type === 'folder' ? (
									<Folder className="h-5 w-5" />
								) : (
									<FileText className="h-5 w-5" />
								)}
							</div>

							{/* Info */}
							<div className="flex-1 min-w-0">
								<div className="font-medium truncate">{item.name}</div>
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span>Deleted {formatTimeAgo(item.deletedAt!)}</span>
									<span>•</span>
									<span
										className={cn(
											isExpiringSoon && 'text-amber-500 flex items-center gap-1'
										)}
									>
										{isExpiringSoon && <AlertTriangle className="h-3 w-3" />}
										{daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left
									</span>
								</div>
							</div>

							{/* Actions */}
							<div className="flex items-center gap-2 shrink-0">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleRestore(item.id)}
									disabled={isRestoring === item.id}
									className="h-8"
								>
									{isRestoring === item.id ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<>
											<RotateCcw className="h-4 w-4 mr-1" />
											Restore
										</>
									)}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handlePermanentDelete(item.id, item.name)}
									disabled={isDeleting === item.id}
									className="h-8 text-destructive hover:text-destructive"
								>
									{isDeleting === item.id ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Trash2 className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>
					)
				})}
			</div>

			<ConfirmationPopover />
		</div>
	)
}
