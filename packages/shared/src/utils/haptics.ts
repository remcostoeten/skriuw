/**
 * Haptic feedback utility using the Vibration API.
 * Gracefully handles cases where the API is not supported (e.g., iOS Safari).
 */
export const haptic = {
    /** A very short, subtle tap (10ms) */
    light: () => {
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
            window.navigator.vibrate(10)
        }
    },

    /** A slightly stronger tap (20ms) */
    medium: () => {
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
            window.navigator.vibrate(20)
        }
    },

    /** Success pattern: double tap */
    success: () => {
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
            window.navigator.vibrate([10, 30, 10])
        }
    },

    /** Warning pattern: single medium pulse */
    warning: () => {
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
            window.navigator.vibrate(50)
        }
    },

    /** Error pattern: triple heavy pulse */
    error: () => {
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
            window.navigator.vibrate([100, 50, 100, 50, 100])
        }
    }
}
