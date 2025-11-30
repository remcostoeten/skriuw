import { Block } from '@blocknote/core'
import {
    useState,
    useCallback,
    useEffect,
    startTransition,
    useDeferredValue
} from 'react'

import { createFolder as createFolderMutation } from '../api/mutations/create-folder'
import { createNote as createNoteMutation } from '../api/mutations/create-note'
import { deleteItem as deleteItemMutation } from '../api/mutations/delete-item'
import { moveItem as moveItemMutation } from '../api/mutations/move-item'
import { renameItem as renameItemMutation } from '../api/mutations/rename-item'
import { updateNote as updateNoteMutation } from '../api/mutations/update-note'
import { getItems } from '../api/queries/get-items'
import { getNote as getNoteQuery } from '../api/queries/get-note'

import type { Note, Folder, Item } from '../types'

/**
 * useNotes hook with non-blocking updates and loading states
 * Supports concurrent rendering and prevents layout shifts
 */
export function useNotes() {
    const [items, setItems] = useState<Item[]>([])
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const deferredItems = useDeferredValue(items)

    useEffect(() => {
        let isCancelled = false

        const loadInitialData = async () => {
            try {
                const data = await getItems()
                if (!isCancelled) {
                    setItems(data)
                    setIsInitialLoading(false)
                }
            } catch (error) {
                console.error('Failed to load notes:', error)
                if (!isCancelled) {
                    setIsInitialLoading(false)
                }
            }
        }

        loadInitialData()

        return () => {
            isCancelled = true
        }
    }, [])

    const refreshItems = useCallback(async () => {
        setIsRefreshing(true)
        try {
            const updatedItems = await getItems()
            startTransition(() => {
                setItems(updatedItems)
                setIsRefreshing(false)
            })
        } catch (error) {
            console.error('Failed to refresh items:', error)
            setIsRefreshing(false)
        }
    }, [])

    const getNote = useCallback(
        async (id: string): Promise<Note | undefined> => {
            return await getNoteQuery(id)
        },
        []
    )

    const getItem = useCallback(
        async (id: string): Promise<Item | undefined> => {
            const items = await getItems()
            return items.find(item => item.id === id)
        },
        []
    )

    const createNote = useCallback(
        async (name: string = 'Untitled', parentFolderId?: string) => {
            const newNote = await createNoteMutation({ name, parentFolderId })
            // Non-blocking refresh
            refreshItems()
            return newNote
        },
        [refreshItems]
    )

    const createFolder = useCallback(
        async (name: string = 'New Folder', parentFolderId?: string) => {
            const newFolder = await createFolderMutation({
                name,
                parentFolderId
            })
            // Non-blocking refresh
            refreshItems()
            return newFolder
        },
        [refreshItems]
    )

    const updateNote = useCallback(
        async (id: string, content: Block[], name?: string) => {
            await updateNoteMutation(id, { content, name })
            // Non-blocking refresh
            refreshItems()
        },
        [refreshItems]
    )

    const renameItem = useCallback(
        async (id: string, newName: string) => {
            await renameItemMutation(id, newName)
            // Non-blocking refresh
            refreshItems()
        },
        [refreshItems]
    )

    const deleteItem = useCallback(
        async (id: string) => {
            const success = await deleteItemMutation(id)
            if (success) {
                // Non-blocking refresh
                refreshItems()
            }
            return success
        },
        [refreshItems]
    )

    const moveItem = useCallback(
        async (itemId: string, targetFolderId: string | null) => {
            const success = await moveItemMutation(itemId, targetFolderId)
            if (success) {
                // Non-blocking refresh
                refreshItems()
            }
            return success
        },
        [refreshItems]
    )

    const countChildren = useCallback(
        async (folderId: string): Promise<number> => {
            const items = await getItems()
            const folder = items.find(item => item.id === folderId && item.type === 'folder') as Folder | undefined
            if (folder && Array.isArray(folder.children)) {
                return folder.children.length
            }
            return 0
        },
        []
    )

    return {
        items: deferredItems,
        isInitialLoading,
        isRefreshing,
        getNote,
        getItem,
        createNote,
        createFolder,
        updateNote,
        renameItem,
        deleteItem,
        moveItem,
        countChildren,
        refreshItems
    }
}
