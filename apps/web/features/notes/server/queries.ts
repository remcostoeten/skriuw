import { and, desc, eq, folders, getDatabase, isNull, notes, sql } from '@skriuw/db'
import type { Folder, Note } from '@skriuw/db'

export type NoteTreeItem = (Note | Folder) & {
	childCount: number
}

type ChildCountRow = {
	parentId: string | null
	count: number
}

function toCountMap(rows: ChildCountRow[]): Map<string, number> {
	const counts = new Map<string, number>()
	for (const row of rows) {
		if (!row.parentId) continue
		counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + Number(row.count))
	}
	return counts
}

function sortTreeItems(items: NoteTreeItem[]): NoteTreeItem[] {
	return [...items].sort((a, b) => {
		const aPinned = Number(a.pinned ?? 0)
		const bPinned = Number(b.pinned ?? 0)
		if (aPinned !== bPinned) return bPinned - aPinned
		if (a.updatedAt !== b.updatedAt) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
		return a.name.localeCompare(b.name)
	})
}

async function getChildCountsByParent(userId: string): Promise<Map<string, number>> {
	const db = getDatabase()

	const [folderCountRows, noteCountRows] = await Promise.all([
		db
			.select({
				parentId: folders.parentFolderId,
				count: sql<number>`count(*)`
			})
			.from(folders)
			.where(and(eq(folders.userId, userId), isNull(folders.deletedAt)))
			.groupBy(folders.parentFolderId),
		db
			.select({
				parentId: notes.parentFolderId,
				count: sql<number>`count(*)`
			})
			.from(notes)
			.where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
			.groupBy(notes.parentFolderId)
	])

	const counts = toCountMap(folderCountRows)
	for (const [parentId, count] of toCountMap(noteCountRows)) {
		counts.set(parentId, (counts.get(parentId) ?? 0) + count)
	}

	return counts
}

export async function getNotes(userId: string): Promise<Note[]> {
	const db = getDatabase()

	return db
		.select()
		.from(notes)
		.where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
		.orderBy(desc(notes.pinned), desc(notes.updatedAt))
}

export async function getNoteById(userId: string, id: string): Promise<Note | null> {
	const db = getDatabase()

	const result = await db
		.select()
		.from(notes)
		.where(and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)))
		.limit(1)

	return result[0] ?? null
}

export async function getNoteTree(userId: string): Promise<NoteTreeItem[]> {
	const db = getDatabase()

	const [rootFolders, rootNotes, childCounts] = await Promise.all([
		db
			.select()
			.from(folders)
			.where(
				and(
					eq(folders.userId, userId),
					isNull(folders.deletedAt),
					isNull(folders.parentFolderId)
				)
			),
		db
			.select()
			.from(notes)
			.where(
				and(eq(notes.userId, userId), isNull(notes.deletedAt), isNull(notes.parentFolderId))
			),
		getChildCountsByParent(userId)
	])

	const items: NoteTreeItem[] = [
		...rootFolders.map((folder) => ({
			...folder,
			childCount: childCounts.get(folder.id) ?? 0
		})),
		...rootNotes.map((note) => ({
			...note,
			childCount: childCounts.get(note.id) ?? 0
		}))
	]

	return sortTreeItems(items)
}

export async function getChildren(userId: string, parentId: string): Promise<NoteTreeItem[]> {
	const db = getDatabase()

	const [childFolders, childNotes, childCounts] = await Promise.all([
		db
			.select()
			.from(folders)
			.where(
				and(
					eq(folders.userId, userId),
					isNull(folders.deletedAt),
					eq(folders.parentFolderId, parentId)
				)
			),
		db
			.select()
			.from(notes)
			.where(
				and(eq(notes.userId, userId), isNull(notes.deletedAt), eq(notes.parentFolderId, parentId))
			),
		getChildCountsByParent(userId)
	])

	const items: NoteTreeItem[] = [
		...childFolders.map((folder) => ({
			...folder,
			childCount: childCounts.get(folder.id) ?? 0
		})),
		...childNotes.map((note) => ({
			...note,
			childCount: childCounts.get(note.id) ?? 0
		}))
	]

	return sortTreeItems(items)
}
