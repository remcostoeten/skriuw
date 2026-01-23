const FOCUSABLE_ELEMENTS = [
	'a[href]',
	'area[href]',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'button:not([disabled])',
	'iframe',
	'object',
	'embed',
	'[contenteditable]',
	'[tabindex]:not([tabindex^="-"])'
]

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS.join(','))).filter(
		(el) => {
			return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
		}
	)
}

export function createFocusTrap(container: HTMLElement) {
	let previouslyFocusedElement: HTMLElement | null = null

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'Tab') return

		const focusableElements = getFocusableElements(container)
		if (focusableElements.length === 0) return

		const firstElement = focusableElements[0]
		const lastElement = focusableElements[focusableElements.length - 1]
		const activeElement = document.activeElement as HTMLElement

		// If focus has escaped the container, loop it back to the first element
		if (!container.contains(activeElement)) {
			e.preventDefault()
			firstElement.focus()
			return
		}

		// Find the current element's index in the focusable elements array
		const currentIndex = focusableElements.indexOf(activeElement)

		// If current element is not in our focusable list, focus the first element
		if (currentIndex === -1) {
			e.preventDefault()
			firstElement.focus()
			return
		}

		// Calculate where focus would go next
		let nextIndex: number
		if (e.shiftKey) {
			// Shift+Tab: going backwards
			if (currentIndex === 0) {
				// At first element, loop to last
				e.preventDefault()
				lastElement.focus()
				return
			}
			nextIndex = currentIndex - 1
		} else {
			// Tab: going forwards
			if (currentIndex === focusableElements.length - 1) {
				// At last element, loop to first
				e.preventDefault()
				firstElement.focus()
				return
			}
			nextIndex = currentIndex + 1
		}

		// Prevent default to stop browser's natural tab order
		// This ensures focus stays within our container
		e.preventDefault()

		// Focus the next element in our controlled order
		const nextElement = focusableElements[nextIndex]
		if (nextElement) {
			nextElement.focus()
		}
	}

	const activate = () => {
		previouslyFocusedElement = document.activeElement as HTMLElement

		const focusContainer = () => {
			const focusableElements = getFocusableElements(container)
			if (focusableElements.length > 0) {
				focusableElements[0].focus()
			} else {
				container.focus()
			}
		}

		// Ensure focus runs after portal content is committed
		requestAnimationFrame(focusContainer)

		// Use capture phase to ensure we handle Tab before other handlers
		document.addEventListener('keydown', handleKeyDown, true)
	}

	const deactivate = () => {
		document.removeEventListener('keydown', handleKeyDown, true)

		if (previouslyFocusedElement && previouslyFocusedElement.focus) {
			previouslyFocusedElement.focus()
		}
	}

	return { activate, deactivate }
}
