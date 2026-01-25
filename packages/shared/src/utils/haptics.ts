/**
 * Haptic feedback utility using the Vibration API.
 * On iOS (where vibration is not supported), falls back to subtle audio feedback.
 * Gracefully handles cases where neither API is supported.
 */

// Audio context for iOS fallback
let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext | null => {
	if (typeof window === 'undefined') return null

	if (!audioContext) {
		try {
			const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
			audioContext = new AudioContextClass()
		} catch {
			return null
		}
	}
	return audioContext
}

/**
 * Play a brief audio click for haptic-like feedback on iOS
 * @param frequency - Frequency in Hz (higher = sharper sound)
 * @param duration - Duration in milliseconds
 * @param volume - Volume (0-1)
 */
const playAudioClick = (frequency: number, duration: number, volume: number = 0.15) => {
	const ctx = getAudioContext()
	if (!ctx) return

	try {
		const oscillator = ctx.createOscillator()
		const gainNode = ctx.createGain()

		oscillator.connect(gainNode)
		gainNode.connect(ctx.destination)

		oscillator.frequency.value = frequency
		oscillator.type = 'sine'

		gainNode.gain.value = volume
		// Quick fade out to avoid clicks
		gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

		oscillator.start(ctx.currentTime)
		oscillator.stop(ctx.currentTime + duration / 1000)
	} catch {
		// Silently fail if audio feedback doesn't work
	}
}

/**
 * Check if we're on iOS (where vibration API is not supported)
 */
const isIOS = (): boolean => {
	if (typeof window === 'undefined') return false
	return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
}

export const haptic = {
	/** A very short, subtle tap (10ms vibration or 1200Hz click) */
	light: () => {
		if (typeof window === 'undefined') return

		if (window.navigator.vibrate && !isIOS()) {
			window.navigator.vibrate(10)
		} else {
			playAudioClick(1200, 8, 0.08)
		}
	},

	/** A slightly stronger tap (20ms vibration or 1000Hz click) */
	medium: () => {
		if (typeof window === 'undefined') return

		if (window.navigator.vibrate && !isIOS()) {
			window.navigator.vibrate(20)
		} else {
			playAudioClick(1000, 15, 0.12)
		}
	},

	/** Success pattern: double tap */
	success: () => {
		if (typeof window === 'undefined') return

		if (window.navigator.vibrate && !isIOS()) {
			window.navigator.vibrate([10, 30, 10])
		} else {
			playAudioClick(1400, 10, 0.1)
			setTimeout(() => playAudioClick(1600, 10, 0.1), 40)
		}
	},

	/** Warning pattern: single medium pulse */
	warning: () => {
		if (typeof window === 'undefined') return

		if (window.navigator.vibrate && !isIOS()) {
			window.navigator.vibrate(50)
		} else {
			playAudioClick(800, 30, 0.15)
		}
	},

	/** Error pattern: triple heavy pulse */
	error: () => {
		if (typeof window === 'undefined') return

		if (window.navigator.vibrate && !isIOS()) {
			window.navigator.vibrate([100, 50, 100, 50, 100])
		} else {
			playAudioClick(600, 40, 0.15)
			setTimeout(() => playAudioClick(550, 40, 0.15), 90)
			setTimeout(() => playAudioClick(500, 40, 0.15), 180)
		}
	}
}
