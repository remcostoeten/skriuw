'use client'

import { AnimatePresence, motion, useAnimation, type Variants } from 'framer-motion'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@skriuw/core-logic'

const ease = [0.16, 1, 0.3, 1] as const

type props = {
	href?: string
	text?: string
	flipWords?: string[]
	flipDuration?: number
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

export const FlipWords = ({
	words,
	duration = 3000,
	className
}: {
	words: string[]
	duration?: number
	className?: string
}) => {
	const [currentWord, setCurrentWord] = useState(words[0])
	const [isAnimating, setIsAnimating] = useState<boolean>(false)

	const startAnimation = useCallback(() => {
		const word = words[words.indexOf(currentWord) + 1] || words[0]
		setCurrentWord(word)
		setIsAnimating(true)
	}, [currentWord, words])

	useEffect(() => {
		if (!isAnimating)
			setTimeout(() => {
				startAnimation()
			}, duration)
	}, [isAnimating, duration, startAnimation])

	return (
		<AnimatePresence
			onExitComplete={() => {
				setIsAnimating(false)
			}}
		>
			<motion.span
				initial={{
					opacity: 0,
					y: 10
				}}
				animate={{
					opacity: 1,
					y: 0
				}}
				transition={{
					type: 'spring',
					stiffness: 100,
					damping: 10
				}}
				exit={{
					opacity: 0,
					y: -40,
					x: 40,
					filter: 'blur(8px)',
					scale: 2,
					position: 'absolute'
				}}
				className={cn('inline-block relative text-inherit', className)}
				key={currentWord}
			>
				{currentWord.split(' ').map((word, wordIndex) => (
					<motion.span
						key={word + wordIndex}
						initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
						animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
						transition={{
							delay: wordIndex * 0.3,
							duration: 0.3
						}}
						className="inline-block whitespace-nowrap"
					>
						{word.split('').map((letter, letterIndex) => (
							<motion.span
								key={word + letterIndex}
								initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
								animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
								transition={{
									delay: wordIndex * 0.3 + letterIndex * 0.05,
									duration: 0.2
								}}
								className="inline-block"
							>
								{letter}
							</motion.span>
						))}
						<span className="inline-block">&nbsp;</span>
					</motion.span>
				))}
			</motion.span>
		</AnimatePresence>
	)
}

export default function HeroBadge({
	href,
	text,
	flipWords,
	flipDuration = 3000,
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
				<span className="relative overflow-hidden">
					{flipWords ? (
						<FlipWords
							words={flipWords}
							duration={flipDuration}
							className={cn(!icon && 'pl-2')}
						/>
					) : (
						<span>{text}</span>
					)}
				</span>
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
								if (cookieFn) createCookie()
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
