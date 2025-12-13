'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type Position = {
	x: number
	y: number
}

type Options = {
	initialPosition?: Position
	storageKey?: string
	disabled?: boolean
	bounds?: {
		top?: number
		left?: number
		right?: number
		bottom?: number
	}
}

export function useDraggable({
	initialPosition = { x: 0, y: 0 },
	storageKey,
	disabled = false,
	bounds = {},
}: Options) {
	const [position, setPosition] = useState<Position>(initialPosition)
	const [isDragging, setIsDragging] = useState(false)
	const dragRef = useRef<HTMLDivElement>(null)
	const dragStartPos = useRef<Position>({ x: 0, y: 0 })
	const elementStartPos = useRef<Position>({ x: 0, y: 0 })

	// Load saved position from localStorage
	useEffect(() => {
		if (storageKey && typeof window !== 'undefined') {
			try {
				const saved = localStorage.getItem(storageKey)
				if (saved) {
					const savedPos = JSON.parse(saved) as Position
					// Validate saved position is within reasonable bounds
					if (
						typeof savedPos.x === 'number' &&
						typeof savedPos.y === 'number' &&
						savedPos.x >= -1000 &&
						savedPos.x <= window.innerWidth + 1000 &&
						savedPos.y >= -1000 &&
						savedPos.y <= window.innerHeight + 1000
					) {
						setPosition(savedPos)
					}
				}
			} catch (error) {
				console.warn('Failed to load saved position:', error)
			}
		}
	}, [storageKey])

	// Save position to localStorage
	const savePosition = useCallback(
		(pos: Position) => {
			if (storageKey && typeof window !== 'undefined') {
				try {
					localStorage.setItem(storageKey, JSON.stringify(pos))
				} catch (error) {
					console.warn('Failed to save position:', error)
				}
			}
		},
		[storageKey]
	)

	const constrainToBounds = useCallback(
		(pos: Position): Position => {
			if (!dragRef.current) return pos

			const rect = dragRef.current.getBoundingClientRect()
			const windowWidth = window.innerWidth
			const windowHeight = window.innerHeight

			let constrainedX = pos.x
			let constrainedY = pos.y

			// Apply bounds
			if (bounds.left !== undefined) {
				constrainedX = Math.max(bounds.left, constrainedX)
			}
			if (bounds.right !== undefined) {
				constrainedX = Math.min(bounds.right - rect.width, constrainedX)
			} else {
				// Keep within viewport
				constrainedX = Math.min(windowWidth - rect.width, constrainedX)
			}

			if (bounds.top !== undefined) {
				constrainedY = Math.max(bounds.top, constrainedY)
			}
			if (bounds.bottom !== undefined) {
				constrainedY = Math.min(bounds.bottom - rect.height, constrainedY)
			} else {
				// Keep within viewport
				constrainedY = Math.min(windowHeight - rect.height, constrainedY)
			}

			// Ensure element doesn't go completely off screen
			constrainedX = Math.max(-rect.width + 50, constrainedX)
			constrainedY = Math.max(-rect.height + 50, constrainedY)

			return { x: constrainedX, y: constrainedY }
		},
		[bounds]
	)



	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (disabled) return

			e.preventDefault()
			e.stopPropagation()

			setIsDragging(true)
			dragStartPos.current = { x: e.clientX, y: e.clientY }
			elementStartPos.current = position
		},
		[disabled, position]
	)

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDragging || disabled) return

			e.preventDefault()

			const deltaX = e.clientX - dragStartPos.current.x
			const deltaY = e.clientY - dragStartPos.current.y

			const newPosition = {
				x: elementStartPos.current.x + deltaX,
				y: elementStartPos.current.y + deltaY,
			}

			const constrainedPosition = constrainToBounds(newPosition)
			setPosition(constrainedPosition)
		},
		[isDragging, disabled, constrainToBounds]
	)

	const handleMouseUp = useCallback(() => {
		if (!isDragging) return

		setIsDragging(false)
		savePosition(position)
	}, [isDragging, position, savePosition])

	// Touch support for mobile
	const handleTouchStart = useCallback(
		(e: React.TouchEvent) => {
			if (disabled) return

			const touch = e.touches[0]
			setIsDragging(true)
			dragStartPos.current = { x: touch.clientX, y: touch.clientY }
			elementStartPos.current = position
		},
		[disabled, position]
	)

	const handleTouchMove = useCallback(
		(e: TouchEvent) => {
			if (!isDragging || disabled) return

			e.preventDefault()
			const touch = e.touches[0]

			const deltaX = touch.clientX - dragStartPos.current.x
			const deltaY = touch.clientY - dragStartPos.current.y

			const newPosition = {
				x: elementStartPos.current.x + deltaX,
				y: elementStartPos.current.y + deltaY,
			}

			const constrainedPosition = constrainToBounds(newPosition)
			setPosition(constrainedPosition)
		},
		[isDragging, disabled, constrainToBounds]
	)

	const handleTouchUp = useCallback(() => {
		if (!isDragging) return

		setIsDragging(false)
		savePosition(position)
	}, [isDragging, position, savePosition])

	// Cleanup on unmount is handled by the main effect below

	const resetPosition = useCallback(() => {
		const resetPos = constrainToBounds(initialPosition)
		setPosition(resetPos)
		savePosition(resetPos)
	}, [initialPosition, constrainToBounds, savePosition])

	// Manage global event listeners
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
			document.addEventListener('touchmove', handleTouchMove, { passive: false })
			document.addEventListener('touchend', handleTouchUp)
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.removeEventListener('touchmove', handleTouchMove)
			document.removeEventListener('touchend', handleTouchUp)
		}
	}, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchUp])

	return {
		dragRef,
		position,
		isDragging,
		handleMouseDown,
		handleTouchStart,
		resetPosition,
	}
}
