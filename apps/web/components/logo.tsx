'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const LogoIcon = () => {
	return (
		<svg
			viewBox="0 0 390 513"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			className="h-5 w-5 text-primary transition-all duration-300"
			preserveAspectRatio="xMidYMid meet"
		>
			<g fill="currentColor">
				<path d="M6 52 L0 58 L0 391 L8 400 L82 440 L89 441 L94 439 L99 432 L99 104 L94 96 L14 52 Z" />
				<path d="M133 0 L123 8 L123 504 L130 511 L140 512 L237 463 L246 452 L246 64 L234 52 L150 6 Z" />
				<path d="M277 78 L272 83 L272 434 L278 440 L288 440 L378 391 L390 380 L390 139 L379 128 L299 78 Z" />
			</g>
		</svg>
	)
}

export function Logo() {
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	const placeholder = (
		<div className="group relative flex h-7 w-7 items-center justify-center">
			<div className="relative flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm shadow-lg border border-primary/20">
				<div className="h-5 w-5 rounded-md bg-muted animate-pulse" />
			</div>
		</div>
	)

	if (!isMounted) {
		return (
			<div className="flex items-center justify-center">
				<Link href="/">{placeholder}</Link>
			</div>
		)
	}

	return (
		<div className="flex items-center justify-center">
			<Link href="/">
				<motion.div
					className="group relative flex h-7 w-7 items-center justify-center"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{
						duration: 0.3,
						ease: [0.76, 0, 0.24, 1],
						delay: 0.2,
					}}
				>
					<motion.div
						className="absolute inset-0 rounded-md bg-gradient-to-br from-primary/20 via-primary/15 to-primary/10"
						initial={{ opacity: 0 }}
						animate={{ opacity: 0.9 }}
						transition={{ delay: 0.3, duration: 0.5 }}
					/>
					<motion.div
						className="absolute inset-0 rounded-md bg-primary/5 blur-xl"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.4, duration: 0.5 }}
					/>
					<motion.div
						className="relative flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm shadow-lg border border-primary/20"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.5, duration: 0.5 }}
					>
						<LogoIcon />
					</motion.div>
				</motion.div>
			</Link>
		</div>
	)
}
