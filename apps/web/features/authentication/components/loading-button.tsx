'use client'

import { cn } from "@skriuw/shared";
import { Button } from "@skriuw/ui";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type LoadingButtonProps = {
	isLoading?: boolean
	loadingText?: string
	icon?: ReactNode
	variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
	children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

/**
 * A button with smooth animated transitions between normal and loading states.
 * Uses framer-motion for fluid icon/text swaps.
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
	(
		{
			isLoading,
			loadingText,
			icon,
			variant = 'default',
			children,
			className,
			disabled,
			...props
		},
		ref
	) => {
		return (
			<Button
				ref={ref}
				variant={variant}
				disabled={disabled || isLoading}
				className={cn(
					'relative overflow-hidden transition-all duration-300',
					isLoading && 'opacity-90',
					className
				)}
				{...props}
			>
				<span className='flex items-center justify-center gap-3'>
					{/* Icon slot with cross-fade animation */}
					<AnimatePresence mode='wait' initial={false}>
						{isLoading ? (
							<motion.span
								key='loader'
								initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
								animate={{ opacity: 1, scale: 1, rotate: 0 }}
								exit={{ opacity: 0, scale: 0.5, rotate: 180 }}
								transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
								className='flex items-center justify-center'
							>
								<Loader2 className='h-[18px] w-[18px] animate-spin' />
							</motion.span>
						) : icon ? (
							<motion.span
								key='icon'
								initial={{ opacity: 0, scale: 0.5 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.5 }}
								transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
								className='flex items-center justify-center'
							>
								{icon}
							</motion.span>
						) : null}
					</AnimatePresence>

					{/* Text slot with slide animation */}
					<AnimatePresence mode='wait' initial={false}>
						<motion.span
							key={isLoading ? 'loading' : 'normal'}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
						>
							{isLoading ? loadingText || 'Please wait...' : children}
						</motion.span>
					</AnimatePresence>
				</span>

				{/* Subtle pulse overlay when loading */}
				<AnimatePresence>
					{isLoading && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: [0.05, 0.1, 0.05] }}
							exit={{ opacity: 0 }}
							transition={{
								duration: 1.5,
								repeat: Infinity,
								ease: 'easeInOut'
							}}
							className='absolute inset-0 dark:bg-white/10 bg-black/10 pointer-events-none'
						/>
					)}
				</AnimatePresence>
			</Button>
		)
	}
)

LoadingButton.displayName = 'LoadingButton'
