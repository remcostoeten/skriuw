'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { haptic, type EditorGestureCallbacks } from '@skriuw/shared'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@skriuw/shared/client'

type GestureState = {
    isDoubleTapPending: boolean
    lastTapTime: number
    touchStartY: number
    touchStartX: number
    touchStartTime: number
    isPulling: boolean
    pullDistance: number
}

const DOUBLE_TAP_DELAY = 300 // ms
const PULL_THRESHOLD = 80 // px to trigger pull-down action
const SWIPE_THRESHOLD = 100 // px to trigger swipe
const LONG_PRESS_DELAY = 500 // ms

export function useEditorGestures(
    containerRef: React.RefObject<HTMLElement | null>,
    callbacks: EditorGestureCallbacks = {}
) {
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
    const [isEditing, setIsEditing] = useState(true)
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | number | null>(null)

    const stateRef = useRef<GestureState>({
        isDoubleTapPending: false,
        lastTapTime: 0,
        touchStartY: 0,
        touchStartX: 0,
        touchStartTime: 0,
        isPulling: false,
        pullDistance: 0,
    })

    const toggleEditMode = useCallback(() => {
        setIsEditing(prev => {
            const newValue = !prev
            haptic.medium()
            return newValue
        })
        callbacks.onDoubleTap?.()
    }, [callbacks])

    const handlePullDown = useCallback(() => {
        haptic.success()
        callbacks.onPullDown?.()
    }, [callbacks])

    const clearLongPressTimer = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    // Handle touch start
    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (!isMobile) return

        const touch = e.touches[0]
        const state = stateRef.current

        state.touchStartY = touch.clientY
        state.touchStartX = touch.clientX
        state.touchStartTime = Date.now()

        // Check if we're at the top of the scroll container (for pull-down)
        const container = containerRef.current
        if (container && container.scrollTop <= 0) {
            state.isPulling = true
        }

        // Start long press timer
        const target = e.target as HTMLElement
        const blockElement = target.closest('[data-block-id]') as HTMLElement
        if (blockElement) {
            longPressTimerRef.current = setTimeout(() => {
                haptic.warning()
                callbacks.onLongPress?.(blockElement)
            }, LONG_PRESS_DELAY)
        }
    }, [isMobile, containerRef, callbacks])

    // Handle touch move
    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isMobile) return

        const touch = e.touches[0]
        const state = stateRef.current

        // Cancel long press on movement
        const deltaX = Math.abs(touch.clientX - state.touchStartX)
        const deltaY = Math.abs(touch.clientY - state.touchStartY)
        if (deltaX > 10 || deltaY > 10) {
            clearLongPressTimer()
        }

        // Track pull-down distance
        if (state.isPulling && touch.clientY > state.touchStartY) {
            state.pullDistance = touch.clientY - state.touchStartY

            // Add visual feedback for pull (could dispatch custom event for UI)
            if (state.pullDistance > PULL_THRESHOLD * 0.5) {
                // Halfway there - light haptic
                if (state.pullDistance > PULL_THRESHOLD * 0.5 && state.pullDistance < PULL_THRESHOLD * 0.6) {
                    haptic.light()
                }
            }
        }
    }, [isMobile, clearLongPressTimer])

    // Handle touch end
    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (!isMobile) return

        const state = stateRef.current
        const touchEndTime = Date.now()
        const touchDuration = touchEndTime - state.touchStartTime

        clearLongPressTimer()

        // Check for pull-down action
        if (state.isPulling && state.pullDistance > PULL_THRESHOLD) {
            handlePullDown()
            state.isPulling = false
            state.pullDistance = 0
            return
        }

        state.isPulling = false
        state.pullDistance = 0

        // Check for swipe gestures
        const touch = e.changedTouches[0]
        const deltaX = touch.clientX - state.touchStartX
        const deltaY = touch.clientY - state.touchStartY

        // Horizontal swipe detection
        if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
            if (deltaX > 0) {
                haptic.light()
                callbacks.onSwipeRight?.()
            } else {
                haptic.light()
                callbacks.onSwipeLeft?.()
            }
            return
        }

        // Double-tap detection (only for short taps)
        if (touchDuration < 200) {
            const timeSinceLastTap = touchEndTime - state.lastTapTime

            if (timeSinceLastTap < DOUBLE_TAP_DELAY && state.isDoubleTapPending) {
                // Double tap detected!
                state.isDoubleTapPending = false
                toggleEditMode()
            } else {
                // Start waiting for potential second tap
                state.isDoubleTapPending = true
                state.lastTapTime = touchEndTime

                // Reset after delay
                setTimeout(() => {
                    state.isDoubleTapPending = false
                }, DOUBLE_TAP_DELAY)
            }
        }
    }, [isMobile, clearLongPressTimer, handlePullDown, toggleEditMode, callbacks])

    // Attach event listeners
    useEffect(() => {
        const container = containerRef.current
        if (!container || !isMobile) return

        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        container.addEventListener('touchmove', handleTouchMove, { passive: true })
        container.addEventListener('touchend', handleTouchEnd, { passive: true })

        return () => {
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)
            clearLongPressTimer()
        }
    }, [containerRef, isMobile, handleTouchStart, handleTouchMove, handleTouchEnd, clearLongPressTimer])

    return {
        isEditing,
        setIsEditing,
        toggleEditMode,
    }
}
