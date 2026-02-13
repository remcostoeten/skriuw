'use client'

import { useState, useEffect, useCallback } from 'react'
import { PromptEvent } from './types'
import { isIos, isSafari, shouldShowInstallPrompt, markInstallDismissed } from './utilities'

export function useInstallPrompt() {
	const [deferredPrompt, setDeferredPrompt] = useState<PromptEvent | null>(null)
	const [showBanner, setShowBanner] = useState(false)
	const [showInstructions, setShowInstructions] = useState(false)
	const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')

	const dismiss = useCallback(() => {
		setShowBanner(false)
		setShowInstructions(false)
		markInstallDismissed()
	}, [])

	const close = useCallback(() => {
		setShowBanner(false)
		setShowInstructions(false)
	}, [])

	useEffect(() => {
		// Initial check
		if (!shouldShowInstallPrompt()) return

		const _isIos = isIos()
		setPlatform(_isIos ? 'ios' : 'android') // simplistic fallback, refining below

		if (_isIos && isSafari()) {
			// On iOS Safari, we can show the banner immediately if not dismissed
			setShowBanner(true)
		}

		// Handle beforeinstallprompt (Android/Chrome)
		const handleBeforeInstallPrompt = (e: Event) => {
			e.preventDefault()
			setDeferredPrompt(e as PromptEvent)
			setPlatform('android') // Assumption: beforeinstallprompt mostly on Android/Chrome

			if (shouldShowInstallPrompt()) {
				setShowBanner(true)
			}
		}

		function handleAppInstalled() {
			setDeferredPrompt(null)
			close()
			markInstallDismissed()
		}

		function handleVisibilityChange() {
			if (document.hidden) {
				// Close our UI to avoid overlap/blocking.
				close()
			}
		}

		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
		window.addEventListener('appinstalled', handleAppInstalled)
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
			window.removeEventListener('appinstalled', handleAppInstalled)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
		}
	}, [close])

	const [isOnline, setIsOnline] = useState(true)

	useEffect(() => {
		if (typeof window !== 'undefined') {
			setIsOnline(navigator.onLine)

			const handleOnline = () => setIsOnline(true)
			const handleOffline = () => setIsOnline(false)

			window.addEventListener('online', handleOnline)
			window.addEventListener('offline', handleOffline)

			return () => {
				window.removeEventListener('online', handleOnline)
				window.removeEventListener('offline', handleOffline)
			}
		}
	}, [])

	async function triggerInstall() {
		if (platform === 'ios') {
			setShowInstructions(true)
			setShowBanner(false)
		} else if (deferredPrompt) {
			deferredPrompt.prompt()
			const choice = await deferredPrompt.userChoice
			if (choice.outcome === 'accepted') {
				setDeferredPrompt(null)
				close()
			}
		}
	}

	return {
		showBanner,
		showInstructions,
		platform,
		isOnline,
		triggerInstall,
		dismiss,
		closeInstructions: () => setShowInstructions(false)
	}
}
