'use client'

import { AnimatePresence, cubicBezier, motion, useAnimation, type Variants } from 'framer-motion'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@skriuw/shared'

type props = {
	href?: string
	text?: string
	icon?: React.ReactNode
	endIcon?: React.ReactNode
	variant?: 'default' | 'outline' | 'ghost'
	size?: 'sm' | 'md' | 'lg'
	className?: string
	onClick?: () => void
	onCancel?: () => void
}

const badgeVariants: Record<string, string> = {
	default: 'bg-background hover:bg-muted',
	outline: 'border-2 hover:bg-muted',
	ghost: 'hover:bg-muted/50'
}

const sizeVariants: Record<string, string> = {
	sm: 'px-3 py-1 text-xs gap-1.5',
	md: 'px-4 py-1.5 text-sm gap-2',
	lg: 'px-5 py-2 text-base gap-2.5'
}

const iconAnimationVariants: Variants = {
	initial: { rotate: 0 },
	hover: { rotate: -10 }
}

export function HeroBadge({
	href,
	text,
	icon,
	endIcon,
	variant = 'default',
	size = 'md',
	className,
	onClick,
	onCancel
}: props) {
	const controls = useAnimation()
	const [isClosed, setIsClosed] = useState(false)

	const BadgeWrapper = (href ? Link : motion.button) as any
	const wrapperProps: { href?: string; onClick?: () => void } = href ? { href } : { onClick }

	const baseClassName = cn(
		'inline-flex items-center -z-10 rounded-full border transition-colors',
		badgeVariants[variant],
		sizeVariants[size],
		className
	)

	return (
		<BadgeWrapper
			{...wrapperProps}
			className={cn('group', href ? 'cursor-pointer' : '')}
		>
			<AnimatePresence mode="wait" onExitComplete={onCancel}>
				{!isClosed && (
					<motion.div
						className={baseClassName}
						initial={{ opacity: 0, y: 200, scale: 0.65 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{
							opacity: 0,
							y: 200,
							scale: 0.65,
							transition: { duration: 0.4, ease: cubicBezier(0.56, 0.2, 0.1, 1) }
						}}
						drag="y"
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 0.5 }}
						onDragEnd={(_, info) => {
							if (info.offset.y > 50) {
								setIsClosed(true)
							}
						}}
						transition={{ duration: 0.8, ease: cubicBezier(0.56, 0.2, 0.1, 1) }}
						onClick={onClick}
						onHoverStart={() => controls.start('hover')}
						onHoverEnd={() => controls.start('initial')}
					>
						{icon && (
							<motion.div
								className="text-foreground/60 transition-colors group-hover:text-primary"
								variants={iconAnimationVariants}
								initial="initial"
								animate={controls}
								transition={{
									type: 'spring',
									stiffness: 300,
									damping: 10
								}}
							>
								{icon}
							</motion.div>
						)}
						<span>{text}</span>
						{endIcon && (
							<motion.div
								className={cn(
									'text-foreground/60 p-2 sm:p-0',
									onCancel && 'hover:text-foreground cursor-pointer'
								)}
								onClick={(e) => {
									if (onCancel) {
										e.preventDefault()
										e.stopPropagation()
										setIsClosed(true)
									}
								}}
							>
								{endIcon}
							</motion.div>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</BadgeWrapper>
	)
}
