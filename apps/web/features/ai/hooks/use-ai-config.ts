'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAIConfig, saveAIConfig, updateAIConfig } from '../api'
import type { AIModel, AIProvider, AIProviderConfig } from '../types'

const AI_CONFIG_KEY = ['ai-config']

export function useAIConfig() {
	return useQuery({
		queryKey: AI_CONFIG_KEY,
		queryFn: getAIConfig,
		staleTime: 60 * 1000
	})
}

export function useSaveAIConfig() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (config: {
			provider: AIProvider
			model: AIModel
			basePrompt?: string
			temperature?: number
		}) => saveAIConfig(config),
		onSuccess: (data) => {
			queryClient.setQueryData(AI_CONFIG_KEY, data)
		}
	})
}

export function useUpdateAIConfig() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (
			updates: Partial<{
				provider: AIProvider
				model: AIModel
				basePrompt: string | null
				temperature: number
			}>
		) => updateAIConfig(updates),
		onMutate: async (updates) => {
			await queryClient.cancelQueries({ queryKey: AI_CONFIG_KEY })
			const previous = queryClient.getQueryData<AIProviderConfig>(AI_CONFIG_KEY)
			if (previous) {
				queryClient.setQueryData(AI_CONFIG_KEY, { ...previous, ...updates })
			}
			return { previous }
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(AI_CONFIG_KEY, context.previous)
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: AI_CONFIG_KEY })
		}
	})
}
