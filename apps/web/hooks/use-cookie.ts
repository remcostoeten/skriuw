import { useState, useEffect, useCallback } from "react";

type CookieOptions = {
	days?: number
	path?: string
	secure?: boolean
	sameSite?: 'Strict' | 'Lax' | 'None'
}

export function useCookie(name: string, defaultValue: string = '') {
	const [value, setValue] = useState<string>(() => {
		if (typeof window === 'undefined') return defaultValue
		const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
		return match ? match[2] : defaultValue
	})

	const updateCookie = useCallback(
		(newValue: string, options: CookieOptions = {}) => {
			const { days = 30, path = '/', secure = true, sameSite = 'Strict' } = options
			const expires = new Date(Date.now() + days * 864e5).toUTCString()

			document.cookie = `${name}=${newValue}; expires=${expires}; path=${path}; ${
				secure ? 'secure;' : ''
			} samesite=${sameSite}`

			setValue(newValue)
			// Dispatch event for other hooks using the same cookie
			window.dispatchEvent(new CustomEvent(`cookie-change-${name}`, { detail: newValue }))
		},
		[name]
	)

	const deleteCookie = useCallback(() => {
		document.cookie = `${name}=; max-age=0; path=/; secure; samesite=strict`
		setValue('')
		window.dispatchEvent(new CustomEvent(`cookie-change-${name}`, { detail: '' }))
	}, [name])

	useEffect(() => {
		const handleCookieChange = (e: CustomEvent) => {
			setValue(e.detail)
		}

		window.addEventListener(`cookie-change-${name}` as any, handleCookieChange)
		return () => {
			window.removeEventListener(`cookie-change-${name}` as any, handleCookieChange)
		}
	}, [name])

	return { value, updateCookie, deleteCookie }
}
