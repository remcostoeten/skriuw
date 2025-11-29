import { useCallback } from 'react'
import { FolderOpen, Pin, Star, Trash2, X } from 'lucide-react'
import { useNotes } from '@/features/notes/hooks/use-notes'
import { useSelectionStore } from '@/stores/selection-store'
import { Button } from 'ui'

import type { Item } from '@/features/notes/types'

interface BulkOperationsBarProps {
    className?: string
    items: Item[]
}

export function BulkOperationsBar({ className = '', items }: BulkOperationsBarProps) {
    const { getSelectedCount, clearSelection, getSelectedIds } = useSelectionStore()

    const {
        deleteItem,
        moveItem,
        pinItem,
        favoriteNote
    } = useNotes()

    // Helper to find item by ID and determine its type
    const findItemById = useCallback((id: string): Item | undefined => {
        const findInItems = (itemList: Item[]): Item | undefined => {
            for (const item of itemList) {
                if (item.id === id) return item
                if (item.type === 'folder') {
                    const found = findInItems(item.children)
                    if (found) return found
                }
            }
            return undefined
        }
        return findInItems(items)
    }, [items])

    const handleBulkDelete = useCallback(async () => {
        const count = getSelectedCount()
        if (confirm(`Delete ${count} item${count !== 1 ? 's' : ''}? This action cannot be undone.`)) {
            const ids = getSelectedIds()
            for (const id of ids) {
                try {
                    await deleteItem(id)
                } catch (error) {
                    console.error(`Failed to delete item ${id}:`, error)
                }
            }
            clearSelection()
        }
    }, [getSelectedCount, getSelectedIds, deleteItem, clearSelection])

    const handleBulkMove = useCallback(async () => {
        // This would open a move dialog, for now just show an alert
        alert('Bulk move feature coming soon! Please use drag and drop for now.')
    }, [])

    const handleBulkPin = useCallback(async () => {
        const ids = getSelectedIds()
        for (const id of ids) {
            try {
                const item = findItemById(id)
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
                const item = findItemById(id)
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
                const item = findItemById(id)
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
                const item = findItemById(id)
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

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkMove}
                        className="h-8 text-xs"
                    >
                        <FolderOpen className="w-3 h-3 mr-2" />
                        Move
                    </Button>

                    <div className="border-l border-border pl-2 flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleBulkPin}
                            className="h-8 text-xs"
                        >
                            <Pin className="w-3 h-3 mr-1" />
                            Pin
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleBulkUnpin}
                            className="h-8 text-xs"
                        >
                            <Pin className="w-3 h-3 mr-1" />
                            Unpin
                        </Button>
                    </div>

                    <div className="border-l border-border pl-2 flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleBulkFavorite}
                            className="h-8 text-xs"
                        >
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

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSelection}
                        className="h-8 text-xs ml-2"
                    >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    )
}