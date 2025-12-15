'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ShieldAlert } from 'lucide-react'

export function AuthGuardListener() {
	// Use a ref to track the last toast time to prevent flood
	const lastToastTime = useRef(0)
	const TOAST_COOLDOWN = 2000 // 2 seconds

	useEffect(() => {
		function handleAuthRequired(event: Event) {
			const now = Date.now()
			if (now - lastToastTime.current < TOAST_COOLDOWN) {
				return
			}

			lastToastTime.current = now

			const detail = (event as CustomEvent<{ status: number; message: string }>).detail
			const status = detail?.status
			const isDisabled = status === 503

			toast(isDisabled ? 'Authentication disabled' : 'Sign in required', {
				description: detail?.message || (isDisabled ? 'Auth config missing' : 'Your session expired'),
				icon: <ShieldAlert className="h-4 w-4" />,
				action: isDisabled
					? undefined
					: {
						label: 'Sign in',
						onClick: () => {
							window.location.href = '/api/auth'
						},
					},
			})
		}

		window.addEventListener('skriuw:auth-required', handleAuthRequired as EventListener)
		return () => window.removeEventListener('skriuw:auth-required', handleAuthRequired as EventListener)
	}, [])

	return null
}
