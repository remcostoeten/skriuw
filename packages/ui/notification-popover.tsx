import { Button } from './button'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@skriuw/shared'
import { useState, useCallback, useRef, useEffect } from 'react'

export type NotificationPopoverOptions = {
	message: string
	variant?: 'default' | 'info' | 'success' | 'warning'
	duration?: number
	position?: {
		x: number
		y: number
	}
}

type NotificationPopoverState = {
	isOpen: boolean
	options: NotificationPopoverOptions | null
}

/**
 * Framework-agnostic notification popover hook
 * Returns a function that shows a notification popover
 *
 * @example
 * const showNotification = useNotificationPopover();
 * showNotification({
 *   message: "Operation completed successfully",
 *   variant: "success",
 *   duration: 3000,
 *   position: { x: 100, y: 200 }
 * });
 */
export function useNotificationPopover() {
	const [state, setState] = useState<NotificationPopoverState>({
		isOpen: false,
		options: null
	})

	const anchorRef = useRef<HTMLDivElement | null>(null)
	const timeoutRef = useRef<NodeJS.Timeout | null>(null)

	const showNotification = useCallback((options: NotificationPopoverOptions) => {
		// Clear any existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
		}

		setState({
			isOpen: true,
			options
		})

		// Auto-hide after duration
		const duration = options.duration || 4000
		timeoutRef.current = setTimeout(() => {
			setState({ isOpen: false, options: null })
		}, duration)
	}, [])

	const handleClose = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
		}
		setState({ isOpen: false, options: null })
	}, [])

	// Position popover anchor
	useEffect(() => {
		if (state.isOpen && anchorRef.current) {
			const position = state.options?.position || {
				x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
				y: typeof window !== 'undefined' ? window.innerHeight - 100 : 0
			}
			anchorRef.current.style.position = 'fixed'
			anchorRef.current.style.left = `${position.x}px`
			anchorRef.current.style.top = `${position.y}px`
			anchorRef.current.style.width = '1px'
			anchorRef.current.style.height = '1px'
			anchorRef.current.style.pointerEvents = 'none'
		}
	}, [state.isOpen, state.options])

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])

	const NotificationPopoverComponent = () => {
		if (!state.options) return null

		const { message, variant = 'default' } = state.options

		return (
			<PopoverPrimitive.Root open={state.isOpen}>
				<PopoverPrimitive.Anchor asChild>
					<div ref={anchorRef} aria-hidden='true' />
				</PopoverPrimitive.Anchor>
				<PopoverPrimitive.Portal>
					<PopoverPrimitive.Content
						align='center'
						side='top'
						sideOffset={8}
						className={cn(
							'z-50 w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden',
							'data-[state=open]:animate-in data-[state=closed]:animate-out',
							'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
							'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
							'data-[side=top]:slide-in-from-bottom-2',
							{
								'border-blue-200 bg-blue-50 text-blue-900': variant === 'info',
								'border-green-200 bg-green-50 text-green-900':
									variant === 'success',
								'border-yellow-200 bg-yellow-50 text-yellow-900':
									variant === 'warning'
							}
						)}
					>
						<div className='flex items-center gap-2'>
							<div className='flex-1 text-sm'>{message}</div>
							<Button
								variant='ghost'
								size='sm'
								onClick={handleClose}
								className='h-6 w-6 p-0 text-muted-foreground hover:text-foreground'
							>
								×
							</Button>
						</div>
					</PopoverPrimitive.Content>
				</PopoverPrimitive.Portal>
			</PopoverPrimitive.Root>
		)
	}

	return {
		showNotification,
		NotificationPopover: NotificationPopoverComponent
	}
}
