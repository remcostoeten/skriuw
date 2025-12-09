'use client'

import { FolderOpen, Pin, Star, Trash2, X } from 'lucide-react'
import { useCallback } from 'react'


import { useNotificationPopover } from '@skriuw/ui/notification-popover'

import { useNotesContext } from '../../features/notes/context/notes-context'

import { useSelectionStore } from '../../stores/selection-store'
import { Button } from '@skriuw/ui/button'

import type { Item } from '../../features/notes/types'
import { findItemById } from '../../features/notes/utils/tree-helpers'

interface BulkOperationsBarProps {
	className?: string
	items: Item[]
}

export function BulkOperationsBar({ className = '', items }: BulkOperationsBarProps) {
	const { getSelectedCount, clearSelection, getSelectedIds } = useSelectionStore()

	const { deleteItem, pinItem, favoriteNote } = useNotesContext()

	const { showNotification, NotificationPopover } = useNotificationPopover()



	const handleBulkDelete = useCallback(async () => {
		const ids = getSelectedIds()
		for (const id of ids) {
			try {
				await deleteItem(id)
			} catch (error) {
				console.error(`Failed to delete item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, deleteItem, clearSelection])

	const handleBulkMove = useCallback(() => {
		// This would open a move dialog, for now just show a notification
		showNotification({
			message: 'Bulk move feature coming soon! Please use drag and drop for now.',
			variant: 'info',
			duration: 4000,
		})
	}, [showNotification])

	const handleBulkPin = useCallback(async () => {
		const ids = getSelectedIds()
		for (const id of ids) {
			try {
				const item = findItemById(items, id)
				if (!item) {
					console.warn(`Item ${id} not found`)
					continue
				}
				await pinItem(id, item.type, true)
			} catch (error) {
				console.error(`Failed to pin item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, pinItem, clearSelection, findItemById])

	const handleBulkUnpin = useCallback(async () => {
		const ids = getSelectedIds()
		for (const id of ids) {
			try {
				const item = findItemById(items, id)
				if (!item) {
					console.warn(`Item ${id} not found`)
					continue
				}
				await pinItem(id, item.type, false)
			} catch (error) {
				console.error(`Failed to unpin item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, pinItem, clearSelection, findItemById])

	const handleBulkFavorite = useCallback(async () => {
		const ids = getSelectedIds()
		for (const id of ids) {
			try {
				const item = findItemById(items, id)
				// Only favorite notes, skip folders
				if (!item || item.type !== 'note') {
					continue
				}
				await favoriteNote(id, true)
			} catch (error) {
				console.error(`Failed to favorite item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, favoriteNote, clearSelection, findItemById])

	const handleBulkUnfavorite = useCallback(async () => {
		const ids = getSelectedIds()
		for (const id of ids) {
			try {
				const item = findItemById(items, id)
				// Only unfavorite notes, skip folders
				if (!item || item.type !== 'note') {
					continue
				}
				await favoriteNote(id, false)
			} catch (error) {
				console.error(`Failed to unfavorite item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, favoriteNote, clearSelection, findItemById])

	const count = getSelectedCount()

	if (count === 0) return null

	return (
		<div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 ${className}`}>
			<div className="bg-background border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 max-w-90vw">
				<span className="text-sm font-medium whitespace-nowrap">
					{count} item{count !== 1 ? 's' : ''} selected
				</span>

				<div className="flex items-center gap-2 flex-wrap">
					<Button
						variant="outline"
						size="sm"
						onClick={handleBulkDelete}
						className="h-8 text-xs"
					>
						<Trash2 className="w-3 h-3 mr-2" />
						Delete
					</Button>

					<Button variant="outline" size="sm" onClick={handleBulkMove} className="h-8 text-xs">
						<FolderOpen className="w-3 h-3 mr-2" />
						Move
					</Button>

					<div className="border-l border-border pl-2 flex items-center gap-1">
						<Button variant="ghost" size="sm" onClick={handleBulkPin} className="h-8 text-xs">
							<Pin className="w-3 h-3 mr-1" />
							Pin
						</Button>

						<Button variant="ghost" size="sm" onClick={handleBulkUnpin} className="h-8 text-xs">
							<Pin className="w-3 h-3 mr-1" />
							Unpin
						</Button>
					</div>

					<div className="border-l border-border pl-2 flex items-center gap-1">
						<Button variant="ghost" size="sm" onClick={handleBulkFavorite} className="h-8 text-xs">
							<Star className="w-3 h-3 mr-1" />
							Favorite
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onClick={handleBulkUnfavorite}
							className="h-8 text-xs"
						>
							<Star className="w-3 h-3 mr-1" />
							Unfavorite
						</Button>
					</div>

					<Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 text-xs ml-2">
						<X className="w-3 h-3 mr-1" />
						Cancel
					</Button>
				</div>
			</div>

			<NotificationPopover />
		</div>
	)
}
