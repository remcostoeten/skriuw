import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/lib/auth-client'
import {
    getLinkedAccounts,
    linkAccount,
    unlinkAccount,
    updateProfile,
    deleteAccount,
    type LinkedAccount,
    type LinkResponse,
    type DeleteResponse
} from '../api/account-client'

export const accountKeys = {
    all: ['account'] as const,
    linkedAccounts: () => [...accountKeys.all, 'linked-accounts'] as const,
}

/**
 * Query hook for fetching linked OAuth accounts
 */
export function useLinkedAccountsQuery() {
    const { data: session } = useSession()

    return useQuery({
        queryKey: accountKeys.linkedAccounts(),
        queryFn: async () => {
            return await getLinkedAccounts()
        },
        enabled: !!session?.user,
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}

/**
 * Mutation hook for linking a new OAuth account
 */
export function useLinkAccountMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ provider, callbackURL }: { provider: string, callbackURL: string }) => {
            return await linkAccount(provider, callbackURL)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: accountKeys.linkedAccounts() })
        }
    })
}

/**
 * Mutation hook for unlinking an OAuth account
 */
export function useUnlinkAccountMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ providerId, accountId }: { providerId: string, accountId?: string }) => {
            return await unlinkAccount(providerId, accountId)
        },
        onMutate: async ({ providerId }) => {
            await queryClient.cancelQueries({ queryKey: accountKeys.linkedAccounts() })
            const previousAccounts = queryClient.getQueryData<LinkedAccount[]>(accountKeys.linkedAccounts())

            // Optimistically remove the account
            queryClient.setQueryData<LinkedAccount[]>(accountKeys.linkedAccounts(), (old = []) =>
                old.filter(account => account.providerId !== providerId)
            )

            return { previousAccounts }
        },
        onError: (err, vars, context) => {
            if (context?.previousAccounts) {
                queryClient.setQueryData(accountKeys.linkedAccounts(), context.previousAccounts)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: accountKeys.linkedAccounts() })
        }
    })
}

/**
 * Mutation hook for updating user profile
 */
export function useUpdateProfileMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (fields: { name?: string; image?: string | null }) => {
            return await updateProfile(fields)
        },
        onSuccess: () => {
            // Invalidate any user-related queries
            queryClient.invalidateQueries({ queryKey: accountKeys.all })
        }
    })
}

/**
 * Mutation hook for deleting user account
 */
export function useDeleteAccountMutation() {
    return useMutation({
        mutationFn: async () => {
            return await deleteAccount()
        }
    })
}
