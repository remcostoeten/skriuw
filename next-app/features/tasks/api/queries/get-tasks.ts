export interface Task {
	id: string
	noteId: string
	blockId: string
	content: string
	checked: number // 0 or 1
	parentTaskId: string | null
	position: number
	createdAt: number
	updatedAt: number
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		},
		cache: 'no-store'
	})

	if (!response.ok) {
		const errorBody = await response.json().catch(() => ({}))
		throw new Error(errorBody?.error ?? `Request failed: ${response.status}`)
	}

	return response.json() as Promise<T>
}

/**
 * Gets all tasks for a specific note
 */
export async function getTasksForNote(noteId: string): Promise<Task[]> {
	if (!noteId) return []
	try {
		return await request<Task[]>(`/api/tasks/${encodeURIComponent(noteId)}`)
	} catch (error) {
		console.error('Failed to get tasks for note:', error)
		throw error
	}
}

/**
 * Gets a single task by blockId
 */
export async function getTaskByBlockId(
	noteId: string,
	blockId: string
): Promise<Task | undefined> {
	if (!noteId || !blockId) return undefined
	try {
		const result = await request<Task | null>(
			`/api/tasks/${encodeURIComponent(noteId)}?blockId=${encodeURIComponent(blockId)}`
		)
		return result ?? undefined
	} catch (error) {
		console.error('Failed to get task by blockId:', error)
		throw error instanceof Error
			? error
			: new Error(`Failed to get task: ${String(error)}`)
	}
}
