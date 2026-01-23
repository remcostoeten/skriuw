import type { Item, Note, Folder } from "../types";
import { useCreateNoteMutation, useCreateFolderMutation } from "./use-notes-query";
import { useSession } from "@/lib/auth-client";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useEffect, useState, useRef } from "react";

export function useGuestMigration() {
	const { data: session } = useSession()
	const [isMigrating, setIsMigrating] = useState(false)

	const createNoteMutation = useCreateNoteMutation()
	const createFolderMutation = useCreateFolderMutation()

	const createNoteMutationRef = useRef(createNoteMutation)
	const createFolderMutationRef = useRef(createFolderMutation)

	useEffect(() => {
		createNoteMutationRef.current = createNoteMutation
		createFolderMutationRef.current = createFolderMutation
	})

	useEffect(() => {
		const userId = session?.user?.id
		if (!userId) return

		const checkAndMigrate = async () => {
			const localData = localStorage.getItem(STORAGE_KEYS.NOTES)
			if (!localData) return

			let guestItems: Item[] = []
			try {
				guestItems = JSON.parse(localData)
			} catch (e) {
				console.error('Failed to parse guest notes for migration', e)
				return
			}

			if (guestItems.length === 0) return

			if (localStorage.getItem('skriuw:migrated_to_' + userId)) return

			setIsMigrating(true)
			console.info('Starting guest data migration...')

			try {
				const idMap = new Map<string, string>()

				const migrateItem = async (item: Item, newParentId?: string) => {
					let newId: string | undefined

					try {
						if (item.type === 'note') {
							const note = item as Note
							const result = await createNoteMutationRef.current.mutateAsync({
								name: note.name,
								content: note.content,
								parentFolderId: newParentId
							})
							newId = result.id
						} else if (item.type === 'folder') {
							const folder = item as Folder
							const result = await createFolderMutationRef.current.mutateAsync({
								name: folder.name,
								parentFolderId: newParentId
							})
							newId = result.id

							if (folder.children?.length) {
								for (const child of folder.children) {
									await migrateItem(child, newId)
								}
							}
						}

						if (newId) {
							idMap.set(item.id, newId)
						}
					} catch (err) {
						console.error(`Failed to migrate item ${item.name} (${item.id})`, err)
					}
				}

				for (const item of guestItems) {
					await migrateItem(item)
				}

				console.info('Guest data migration completed.')
				localStorage.setItem('skriuw:migrated_to_' + userId, 'true')
				localStorage.removeItem(STORAGE_KEYS.NOTES)
			} catch (error) {
				console.error('Migration failed:', error)
			} finally {
				setIsMigrating(false)
			}
		}

		checkAndMigrate()
	}, [session?.user?.id])

	return { isMigrating }
}
