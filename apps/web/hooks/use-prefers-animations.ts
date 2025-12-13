/**
 * @description
 * A hook that is used in the settings dialog to determine if animations are enabled.
 * It returns a boolean value based on the user's settings. As of writing this it's only used for transitions between tabs in the storage and archive page.
 */

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
