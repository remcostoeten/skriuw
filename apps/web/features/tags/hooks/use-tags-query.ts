import type { Tag, TagWithCount, CreateTagInput, UpdateTagInput } from '../types'
import type { BaseEntity } from '@skriuw/shared'
import { useSession } from '@/lib/auth-client'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { readMany, create, update, destroy } from '@skriuw/crud'
import { GUEST_USER_ID, generateId } from '@skriuw/shared'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const TAGS_STORAGE_KEY = 'skriuw:tags'

export const tagsKeys = {
	all: ['tags'] as const,
	lists: () => [...tagsKeys.all, 'list'] as const,
	list: (userId: string | undefined) => [...tagsKeys.lists(), { userId }] as const,
	detail: (id: string) => [...tagsKeys.all, 'detail', id] as const
}

export function useTagsQuery() {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useQuery({
		queryKey: tagsKeys.list(userId),
		queryFn: async (): Promise<Tag[]> => {
			const result = await readMany<Tag>(TAGS_STORAGE_KEY, { userId })
			if (!result.success || !result.data) return []
			return Array.isArray(result.data) ? result.data : []
		},
		staleTime: 60 * 1000
	})
}

export function useTagsWithCountQuery() {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useQuery({
		queryKey: [...tagsKeys.list(userId), 'with-count'],
		queryFn: async (): Promise<TagWithCount[]> => {
			const tagsResult = await readMany<Tag>(TAGS_STORAGE_KEY, { userId })
			const notesResult = await readMany<BaseEntity & { tags?: string[] }>(
				STORAGE_KEYS.NOTES,
				{ userId }
			)

			if (!tagsResult.success || !tagsResult.data) return []

			const tags = Array.isArray(tagsResult.data) ? tagsResult.data : []
			const notes =
				notesResult.success && Array.isArray(notesResult.data) ? notesResult.data : []

			return tags.map((tag) => {
				const noteCount = notes.filter((note) =>
					note.tags?.some((t) => t.toLowerCase() === tag.name.toLowerCase())
				).length
				return { ...tag, noteCount }
			})
		},
		staleTime: 60 * 1000
	})
}

export function useCreateTagMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async (input: CreateTagInput): Promise<Tag> => {
			const existingResult = await readMany<Tag>(TAGS_STORAGE_KEY, { userId })
			const existing =
				existingResult.success && Array.isArray(existingResult.data)
					? existingResult.data
					: []

			const duplicate = existing.find(
				(t) => t.name.toLowerCase() === input.name.toLowerCase()
			)
			if (duplicate) {
				return duplicate
			}

			const now = Date.now()
			const newTag: Tag = {
				id: generateId('tag-'),
				name: input.name.trim(),
				color: input.color ?? '#6366f1',
				userId,
				createdAt: now,
				updatedAt: now
			}

			const result = await create<Tag>(TAGS_STORAGE_KEY, newTag, { userId })
			if (!result.success || !result.data) throw new Error('Failed to create tag')
			return result.data
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: tagsKeys.list(userId) })
		}
	})
}

export function useUpdateTagMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async ({
			id,
			...input
		}: UpdateTagInput & { id: string }): Promise<Tag | null> => {
			const updateData: Partial<Tag> = { updatedAt: Date.now() }
			if (input.name !== undefined) updateData.name = input.name.trim()
			if (input.color !== undefined) updateData.color = input.color

			const result = await update<Tag>(TAGS_STORAGE_KEY, id, updateData, { userId })
			if (!result.success) throw new Error('Failed to update tag')
			return result.data ?? null
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: tagsKeys.list(userId) })
		}
	})
}

export function useDeleteTagMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? GUEST_USER_ID

	return useMutation({
		mutationFn: async (id: string): Promise<boolean> => {
			const result = await destroy(TAGS_STORAGE_KEY, id, { userId })
			if (!result.success) throw new Error('Failed to delete tag')
			return true
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: tagsKeys.list(userId) })
		}
	})
}

export function useEnsureTagExists() {
	const createTag = useCreateTagMutation()

	return async (tagName: string): Promise<Tag> => {
		return createTag.mutateAsync({ name: tagName })
	}
}
