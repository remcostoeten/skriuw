import { useMemo } from 'react'

import { useSettings } from '@/features/settings'

export function usePrefersAnimations(defaultOn = true) {
	const { settings } = useSettings()
	return useMemo(() => {
		const flag = settings?.['ui.animations']
		if (flag === false) return false
		if (flag === true) return true
		return defaultOn
	}, [settings, defaultOn])
}
