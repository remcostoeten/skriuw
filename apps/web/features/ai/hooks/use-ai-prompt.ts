'use client'

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getUsageStats, sendPrompt, testPrompt } from "../api"
import type { AIPromptRequest, AIPromptResponse } from "../types"

const USAGE_KEY = ['ai-usage']

export function useAIUsage() {
    return useQuery({
        queryKey: USAGE_KEY,
        queryFn: getUsageStats,
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000
    })
}

export function useSendPrompt() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (request: AIPromptRequest) => sendPrompt(request),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: USAGE_KEY })
        }
    })
}

export function useTestPrompt() {
    return useMutation({
        mutationFn: (prompt: string) => testPrompt(prompt)
    })
}

export type { AIPromptResponse }
