'use client'

import { useState, useEffect, useCallback } from 'react'
import { PromptEvent, PromptChoice } from './types'
import {
	isIos,
	isSafari,
	isStandalone,
	shouldShowInstallPrompt,
	markInstallDismissed
} from './utilities'

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

		// Handle appinstalled
		const handleAppInstalled = () => {
			setDeferredPrompt(null)
			close()
			// Optionally mark as dismissed/installed permanently
			markInstallDismissed()
		}

		// Handle visibility change to prevent overlap with native UI
		const handleVisibilityChange = () => {
			if (document.hidden) {
				// If page becomes hidden, likely a native prompt or tab switch.
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

	const triggerInstall = async () => {
		if (platform === 'ios') {
			// Show instructions, hide banner
			setShowInstructions(true)
			setShowBanner(false)
		} else if (deferredPrompt) {
			// Trigger native prompt
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
		triggerInstall,
		dismiss,
		closeInstructions: () => setShowInstructions(false)
	}
}
