'use client'

import { motion, useAnimation, type Variants } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@skriuw/core-logic'

const ease = [0.16, 1, 0.3, 1] as const

type props = {
	href?: string
	text: string
	icon?: React.ReactNode
	endIcon?: React.ReactNode
	variant?: 'default' | 'outline' | 'ghost'
	size?: 'sm' | 'md' | 'lg'
	className?: string
	cookieFn?: boolean
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

function createCookie() {
	const cookie = document.cookie
	if (cookie.includes('heroBadgeClicked')) {
		return
	}
	document.cookie = 'heroBadgeClicked=true; path=/; max-age=86400'
}

export default function HeroBadge({
	href,
	text,
	icon,
	endIcon,
	variant = 'default',
	size = 'md',
	className,
	onClick,
	onCancel,
	cookieFn = false
}: props) {
	const controls = useAnimation()

	const BadgeWrapper = href ? Link : motion.button
	const wrapperProps = href ? { href } : ({ onClick } as any)

	const baseClassName = cn(
		'inline-flex items-center -z-10 rounded-full border transition-colors',
		badgeVariants[variant],
		sizeVariants[size],
		className
	)

	return (
		<BadgeWrapper
			{...wrapperProps}
			className={cn('group', href && 'cursor-pointer')}
		>
			<motion.div
				className={baseClassName}
				initial={{ opacity: 0, y: -20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8, ease }}
				onClick={cookieFn ? createCookie : onClick}
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
							'text-foreground/60',
							onCancel && 'hover:text-foreground cursor-pointer'
						)}
						onClick={(e) => {
							if (onCancel) {
								e.preventDefault()
								e.stopPropagation()
								onCancel()
							}
						}}
					>
						{endIcon}
					</motion.div>
				)}
			</motion.div>
		</BadgeWrapper>
	)
}
