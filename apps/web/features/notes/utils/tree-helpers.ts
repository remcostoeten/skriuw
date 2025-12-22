import type { Folder as FolderType, Item } from '../types'

/**
 * Recursively finds an item by its ID in a tree of items.
 */
export function findItemById(items: Item[], id: string): Item | undefined {
    for (const item of items) {
        if (item.id === id) return item
        if (item.type === 'folder') {
            const found = findItemById(item.children, id)
            if (found) return found
        }
    }
    return undefined
}

/**
 * Recursively finds a folder by its ID in a tree of items.
 * Returns null if not found or if found item is not a folder.
 */
export function findFolderById(items: Item[], id: string): FolderType | null {
    const item = findItemById(items, id)
    return item?.type === 'folder' ? (item as FolderType) : null
}

/**
 * Checks if a child item is a descendant of a parent folder.
 */
export function isDescendant(items: Item[], parentId: string, childId: string): boolean {
    const parent = findFolderById(items, parentId)
    if (!parent) return false

    function checkChildren(folder: FolderType): boolean {
        return folder.children.some((child) => {
            if (child.id === childId) return true
            if (child.type === 'folder') {
                return checkChildren(child as FolderType)
            }
            return false
        })
    }

    return checkChildren(parent)
}

/**
 * Helper to find an item in a list (same as findItemById but sometimes used with different naming)
 * Kept for compatibility if needed, but prefer findItemById
 */
export const findInItems = findItemById
