'use client'

import { useSession } from "@/lib/auth-client";
import { notify } from "@/lib/notify";
import { useCallback } from "react";

type MutationGuardOptions = {
	message?: string
}

type MutationGuardResult = {
	isAuthenticated: boolean
	isLoading: boolean
	guard: <T>(action: () => T | Promise<T>, options?: MutationGuardOptions) => Promise<T | null>
}

export function useMutationGuard(): MutationGuardResult {
	const { data: session, isPending } = useSession()

	const isAuthenticated = Boolean(session?.user?.id)

	const guard = useCallback(
		async <T>(
			action: () => T | Promise<T>,
			options: MutationGuardOptions = {}
		): Promise<T | null> => {
			const { message = 'You need an account to perform this action' } = options

			if (isPending) {
				return null
			}

			if (!isAuthenticated) {
				notify(message)
				return null
			}

			try {
				return await action()
			} catch (error) {
				console.error('Guarded action failed:', error)
				throw error
			}
		},
		[isAuthenticated, isPending]
	)

	return {
		isAuthenticated,
		isLoading: isPending,
		guard
	}
}

export function useIsAuthenticated(): {
	isAuthenticated: boolean
	isLoading: boolean
} {
	const { data: session, isPending } = useSession()
	return {
		isAuthenticated: Boolean(session?.user?.id),
		isLoading: isPending
	}
}
