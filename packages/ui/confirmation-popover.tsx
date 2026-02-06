import { Button } from './button'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@skriuw/shared'
import { useState, useCallback, useRef, useEffect } from 'react'

export type ConfirmationPopoverOptions = {
	title: string
	description?: string
	confirmText?: string
	cancelText?: string
	variant?: 'default' | 'destructive'
	onConfirm: () => void | Promise<void>
	onCancel?: () => void
	position?: {
		x: number
		y: number
	}
}

type ConfirmationPopoverState = {
	isOpen: boolean
	options: ConfirmationPopoverOptions | null
}

/**
 * Framework-agnostic confirmation popover hook
 * Returns a function that shows a confirmation popover
 *
 * @example
 * const showConfirm = useConfirmationPopover();
 * showConfirm({
 *   title: "Delete item?",
 *   description: "This action cannot be undone.",
 *   variant: "destructive",
 *   onConfirm: async () => {
 *     await deleteItem(id);
 *   },
 *   position: { x: 100, y: 200 }
 * });
 */
export function useConfirmationPopover() {
	const [state, setState] = useState<ConfirmationPopoverState>({
		isOpen: false,
		options: null
	})

	const anchorRef = useRef<HTMLDivElement | null>(null)

	const showConfirm = useCallback((options: ConfirmationPopoverOptions) => {
		setState({
			isOpen: true,
			options
		})
	}, [])

	const handleConfirm = useCallback(async () => {
		if (state.options) {
			try {
				await state.options.onConfirm()
			} catch (error) {
				console.error('Confirmation action failed:', error)
			}
		}
		setState({ isOpen: false, options: null })
	}, [state.options])

	const handleCancel = useCallback(() => {
		if (state.options?.onCancel) {
			state.options.onCancel()
		}
		setState({ isOpen: false, options: null })
	}, [state.options])

	// Position the popover anchor
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

	const ConfirmationPopoverComponent = () => {
		if (!state.options) return null

		const {
			title,
			description,
			confirmText = 'Confirm',
			cancelText = 'Cancel',
			variant = 'default'
		} = state.options

		return (
			<PopoverPrimitive.Root
				open={state.isOpen}
				onOpenChange={(open) => {
					if (!open) {
						handleCancel()
					}
				}}
			>
				<PopoverPrimitive.Anchor asChild>
					<div ref={anchorRef} aria-hidden='true' />
				</PopoverPrimitive.Anchor>
				<PopoverPrimitive.Portal>
					<PopoverPrimitive.Content
						align='center'
						side='top'
						sideOffset={8}
						className={cn(
							'z-50 w-80 rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-md outline-hidden',
							'data-[state=open]:animate-in data-[state=closed]:animate-out',
							'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
							'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
							'data-[side=top]:slide-in-from-bottom-2'
						)}
						onOpenAutoFocus={(e) => e.preventDefault()}
					>
						<div className='p-4 space-y-4'>
							<div className='space-y-2'>
								<h4 className='font-semibold text-sm leading-none'>{title}</h4>
								{description && (
									<p className='text-sm text-muted-foreground'>{description}</p>
								)}
							</div>
							<div className='flex items-center justify-end gap-2'>
								<Button
									variant='outline'
									size='sm'
									onClick={handleCancel}
									className='h-8 text-xs'
								>
									{cancelText}
								</Button>
								<Button
									variant={variant === 'destructive' ? 'destructive' : 'default'}
									size='sm'
									onClick={handleConfirm}
									className='h-8 text-xs'
								>
									{confirmText}
								</Button>
							</div>
						</div>
					</PopoverPrimitive.Content>
				</PopoverPrimitive.Portal>
			</PopoverPrimitive.Root>
		)
	}

	return {
		showConfirm,
		ConfirmationPopover: ConfirmationPopoverComponent
	}
}
