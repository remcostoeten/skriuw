import type { Folder, Item } from '../types'

export async function getArchiveId(
	items: Item[],
	createFolder: (name?: string) => Promise<Folder>
) {
	const archive = findFolder(items, 'archive')
	if (archive) {
		return archive.id
	}
	const folder = await createFolder('Archive')
	return folder.id
}

function findFolder(items: Item[], name: string): Folder | null {
	for (const item of items) {
		if (item.type === 'folder' && item.name.toLowerCase() === name.toLowerCase()) {
			return item
		}
		if (item.type === 'folder' && Array.isArray(item.children)) {
			const found = findFolder(item.children, name)
			if (found) return found
		}
	}
	return null
}
