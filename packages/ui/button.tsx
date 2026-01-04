'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { cn } from '@skriuw/shared'

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/90',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/90',
				outline:
					'border border-border background hover:bg-accent hover:text-accent-foreground',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-10 px-4 py-2',
				sm: 'h-9 rounded-md px-3',
				lg: 'h-11 rounded-md px-8',
				icon: 'h-10 w-10'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
)

type TRipple = {
	id: number
	x: number
	y: number
}



export interface ButtonProps
	extends
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	VariantProps<typeof buttonVariants> {
	asChild?: boolean
	ripple?: boolean
	rippleColor?: string
	rippleScale?: number
	hoverScale?: number
	onHaptic?: () => void
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant,
			size,
			asChild = false,
			ripple = true,
			rippleColor = 'rgba(255, 255, 255, 0.5)',
			rippleScale = 10,
			hoverScale,
			onHaptic,
			onClick,
			children,
			// Exclude Framer Motion conflicting props to avoid type errors
			onDrag: _onDrag,
			onDragStart: _onDragStart,
			onDragEnd: _onDragEnd,
			onAnimationStart: _onAnimationStart,
			onAnimationEnd: _onAnimationEnd,
			...restProps
		},
		ref
	) => {
		const [ripples, setRipples] = React.useState<TRipple[]>([])

		function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
			onHaptic?.()
			if (ripple) {
				const button = event.currentTarget
				const rect = button.getBoundingClientRect()
				const x = event.clientX - rect.left
				const y = event.clientY - rect.top

				const newRipple: TRipple = {
					id: Date.now(),
					x,
					y
				}

				setRipples((prev) => [...prev, newRipple])

				setTimeout(() => {
					setRipples((prev) =>
						prev.filter((r) => r.id !== newRipple.id)
					)
				}, 600)
			}

			onClick?.(event)
		}

		const motionProps = hoverScale
			? {
				whileHover: { scale: hoverScale }
			}
			: {}

		if (asChild) {
			return (
				<Slot
					ref={ref}
					onClick={onClick}
					className={cn(buttonVariants({ variant, size, className }))}
					{...restProps}
				/>
			)
		}

		return (
			<motion.button
				className={cn(
					buttonVariants({ variant, size, className }),
					ripple && 'overflow-hidden'
				)}
				ref={ref}
				{...motionProps}
				onClick={handleClick}
				{...restProps}
			>
				<span className="relative z-10 flex items-center gap-1">
					{children}
				</span>
				{ripple && (
					<span className="absolute inset-0 z-0">
						<AnimatePresence>
							{ripples.map((ripple) => (
								<motion.span
									key={ripple.id}
									className="absolute rounded-full pointer-events-none"
									style={{
										left: ripple.x,
										top: ripple.y,
										backgroundColor: rippleColor
									}}
									initial={{
										width: 0,
										height: 0,
										x: 0,
										y: 0,
										opacity: 1
									}}
									animate={{
										width: 100 * rippleScale,
										height: 100 * rippleScale,
										x: -50 * rippleScale,
										y: -50 * rippleScale,
										opacity: 0
									}}
									exit={{ opacity: 0 }}
									transition={{
										duration: 0.6,
										ease: 'easeOut'
									}}
								/>
							))}
						</AnimatePresence>
					</span>
				)}
			</motion.button>
		)
	}
)
Button.displayName = 'Button'

export { Button, buttonVariants }
