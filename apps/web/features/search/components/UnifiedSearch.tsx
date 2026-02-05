'use client'

import * as React from 'react'
import { GlobalCommandMenu } from './GlobalCommandMenu'
import { MobileSearchDrawer } from './MobileSearchDrawer'
import { useMediaQuery } from '@skriuw/shared/client'

type Props = {
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

/**
 * Unified Search component that renders the appropriate search UI
 * based on the device type (mobile drawer vs desktop command palette)
 */
export function UnifiedSearch({ open: controlledOpen, onOpenChange }: Props) {
	const [internalOpen, setInternalOpen] = React.useState(false)
	const isMobile = useMediaQuery('(max-width: 768px)')

	const open = controlledOpen ?? internalOpen
	const setOpen = onOpenChange ?? setInternalOpen

	if (isMobile) {
		return (
			<MobileSearchDrawer
				open={open}
				onOpenChange={setOpen}
			/>
		)
	}

	return (
		<GlobalCommandMenu
			open={open}
			onOpenChange={setOpen}
		/>
	)
}

/**
 * Hook to control the unified search from anywhere in the app
 */
export function useUnifiedSearch() {
	const [open, setOpen] = React.useState(false)

	const toggle = React.useCallback(() => setOpen((v) => !v), [])
	const openSearch = React.useCallback(() => setOpen(true), [])
	const closeSearch = React.useCallback(() => setOpen(false), [])

	return {
		open,
		setOpen,
		toggle,
		openSearch,
		closeSearch
	}
}
