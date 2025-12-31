'use client'

import { useEffect, useRef } from 'react'
import { notify } from '@/lib/notify'

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

			notify(isDisabled ? 'Authentication disabled' : 'Sign in required')
		}

		window.addEventListener('skriuw:auth-required', handleAuthRequired as EventListener)
		return () => window.removeEventListener('skriuw:auth-required', handleAuthRequired as EventListener)
	}, [])

	return null
}
