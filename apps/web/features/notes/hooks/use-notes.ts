import { Block } from '@blocknote/core'
import { useState, useCallback, useEffect } from 'react'

import { readOne } from '@skriuw/crud'

import { createFolder as createFolderMutation } from '../api/mutations/create-folder'
import { createNote as createNoteMutation } from '../api/mutations/create-note'
import { deleteItem as deleteItemMutation } from '../api/mutations/delete-item'
import { favoriteNote as favoriteNoteMutation } from '../api/mutations/favorite-note'
import { moveItem as moveItemMutation } from '../api/mutations/move-item'
import { pinItem as pinItemMutation } from '../api/mutations/pin-item'
import { renameItem as renameItemMutation } from '../api/mutations/rename-item'
import { updateNote as updateNoteMutation } from '../api/mutations/update-note'
import { getItems } from '../api/queries/get-items'
import { getNote as getNoteQuery } from '../api/queries/get-note'

import type { Note, Folder, Item } from '../types'

const STORAGE_KEY = 'Skriuw_notes'

export function useNotes() {
	const [items, setItems] = useState<Item[]>([])

	useEffect(() => {
		getItems().then(setItems)
	}, [])

	const getNote = useCallback(async (id: string): Promise<Note | undefined> => {
		return await getNoteQuery(id)
	}, [])

	const getItem = useCallback(async (id: string): Promise<Item | undefined> => {
		const result = await readOne<Item>(STORAGE_KEY, id)
		if (result.success && result.data && 'id' in result.data) {
			return result.data
		}
		return undefined
	}, [])

	const createNote = useCallback(async (name: string = 'Untitled', parentFolderId?: string) => {
		const newNote = await createNoteMutation({ name, parentFolderId })
		const updatedItems = await getItems()
		setItems(updatedItems)
		return newNote
	}, [])

	const createFolder = useCallback(async (name: string = 'New Folder', parentFolderId?: string) => {
		const newFolder = await createFolderMutation({ name, parentFolderId })
		const updatedItems = await getItems()
		setItems(updatedItems)
		return newFolder
	}, [])

	const updateNote = useCallback(async (id: string, content: Block[], name?: string) => {
		await updateNoteMutation(id, { content, name })
		const updatedItems = await getItems()
		setItems(updatedItems)
	}, [])

	const renameItem = useCallback(async (id: string, newName: string) => {
		await renameItemMutation(id, newName)
		const updatedItems = await getItems()
		setItems(updatedItems)
	}, [])

	const deleteItem = useCallback(async (id: string) => {
		const success = await deleteItemMutation(id)
		if (success) {
			const updatedItems = await getItems()
			setItems(updatedItems)
		}
		return success
	}, [])

	const moveItem = useCallback(async (itemId: string, targetFolderId: string | null) => {
		const success = await moveItemMutation(itemId, targetFolderId)
		if (success) {
			const updatedItems = await getItems()
			setItems(updatedItems)
		}
		return success
	}, [])

	const countChildren = useCallback(async (folderId: string): Promise<number> => {
		const result = await readOne<Folder>(STORAGE_KEY, folderId)
		if (
			result.success &&
			result.data &&
			'children' in result.data &&
			Array.isArray(result.data.children)
		) {
			return result.data.children.length
		}
		return 0
	}, [])

	const pinItem = useCallback(
		async (itemId: string, itemType: 'note' | 'folder', pinned: boolean) => {
			await pinItemMutation(itemId, itemType, pinned)
			const updatedItems = await getItems()
			setItems(updatedItems)
		},
		[]
	)

	const favoriteNote = useCallback(async (noteId: string, favorite: boolean) => {
		await favoriteNoteMutation(noteId, favorite)
		const updatedItems = await getItems()
		setItems(updatedItems)
	}, [])

	return {
		items,
		getNote,
		getItem,
		createNote,
		createFolder,
		updateNote,
		renameItem,
		deleteItem,
		moveItem,
		countChildren,
		pinItem,
		favoriteNote,
	}
}
