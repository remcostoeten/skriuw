'use client'

import { useEffect, useState } from 'react'

export function useIsTouchDevice() {
	const [isTouch, setIsTouch] = useState(false)

	useEffect(() => {
		const updateIsTouch = () => {
			if (typeof window === 'undefined') return false

			const coarsePointer = window.matchMedia
				? window.matchMedia('(pointer: coarse)').matches
				: false
			const touchCapable =
				'ontouchstart' in window ||
				(typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)

			return coarsePointer || touchCapable
		}

		setIsTouch(updateIsTouch())

		const mediaQuery = window.matchMedia('(pointer: coarse)')
		const handler = (event: MediaQueryListEvent) => {
			setIsTouch(event.matches || updateIsTouch())
		}

		if (mediaQuery.addEventListener) {
			mediaQuery.addEventListener('change', handler)
			return () => mediaQuery.removeEventListener('change', handler)
		}

		// Fallback for older browsers
		mediaQuery.addListener(handler)
		return () => mediaQuery.removeListener(handler)
	}, [])

	return isTouch
}
