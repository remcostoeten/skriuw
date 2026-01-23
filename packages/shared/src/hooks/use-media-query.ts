'use client'

import { useState, useEffect } from "react";

export const MOBILE_BREAKPOINT = '(max-width: 767px)'

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false)

	useEffect(() => {
		const media = window.matchMedia(query)
		setMatches(media.matches)

		const listener = (e: MediaQueryListEvent) => setMatches(e.matches)

		if (media.addEventListener) {
			media.addEventListener('change', listener)
			return () => media.removeEventListener('change', listener)
		} else {
			media.addListener(listener)
			return () => media.removeListener(listener)
		}
	}, [query])

	return matches
}
