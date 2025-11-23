'use client'

import { motion, easeInOut } from 'framer-motion'

import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

const LogoIcon = () => {
	const pathVariants = {
		hidden: { pathLength: 0, opacity: 0 },
		visible: {
			pathLength: 1,
			opacity: 1,
			transition: {
				pathLength: { duration: 1, ease: easeInOut },
				opacity: { duration: 0.5 }
			}
		}
	}

	const circleVariants = {
		hidden: { scale: 0, opacity: 0 },
		visible: {
			scale: 1,
			opacity: 1,
			transition: {
				duration: 0.3,
				ease: easeInOut
			}
		}
	}

	const streamVariants = {
		hidden: { opacity: 0, pathLength: 0 },
		visible: {
			opacity: 1,
			pathLength: 1,
			transition: {
				duration: 0.5,
				ease: easeInOut
			}
		}
	}

	return (
		<motion.svg
			viewBox="0 0 32 32"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="h-5 w-5 transition-all duration-300"
			initial="hidden"
			animate="visible"
		>
			<motion.path
				d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
				className="fill-primary/10 stroke-primary"
				strokeWidth="1"
				variants={pathVariants}
			/>

			<motion.g
				variants={{
					hidden: { opacity: 0 },
					visible: {
						opacity: 1,
						transition: {
							delayChildren: 0.15,
							staggerChildren: 0.1
						}
					}
				}}
				className="animate-[slideUp_3s_linear_infinite]"
			>
				<motion.path
					d="M8 18L16 22L24 18"
					className="stroke-primary"
					strokeWidth="1"
					strokeLinecap="round"
					variants={streamVariants}
				/>
				<motion.path
					d="M8 14L16 18L24 14"
					className="stroke-primary"
					strokeWidth="1"
					strokeLinecap="round"
					variants={streamVariants}
				/>
				<motion.path
					d="M8 10L16 14L24 10"
					className="stroke-primary"
					strokeWidth="1"
					strokeLinecap="round"
					variants={streamVariants}
				/>
			</motion.g>

			{/* Accent lines with delayed fade-in */}
			<motion.g
				variants={{
					hidden: { opacity: 0 },
					visible: {
						opacity: 1,
						transition: {
							delay: 0.8,
							duration: 0.5
						}
					}
				}}
			>
				<path
					d="M16 2V30"
					className="stroke-primary/40"
					strokeWidth="0.75"
					strokeDasharray="2 2"
				/>
				<path
					d="M4 9L28 9"
					className="stroke-primary/40"
					strokeWidth="0.75"
					strokeDasharray="2 2"
				/>
				<path
					d="M4 23L28 23"
					className="stroke-primary/40"
					strokeWidth="0.75"
					strokeDasharray="2 2"
				/>
			</motion.g>

			{/* Highlight points with staggered pop-in */}
			<motion.g
				variants={{
					hidden: { opacity: 0 },
					visible: {
						opacity: 1,
						transition: {
							delayChildren: 1,
							staggerChildren: 0.1
						}
					}
				}}
			>
				<motion.circle
					cx="16"
					cy="2"
					r="1.5"
					className="fill-primary"
					variants={circleVariants}
				/>
				<motion.circle
					cx="28"
					cy="9"
					r="1.5"
					className="fill-primary"
					variants={circleVariants}
				/>
				<motion.circle
					cx="28"
					cy="23"
					r="1.5"
					className="fill-primary"
					variants={circleVariants}
				/>
				<motion.circle
					cx="16"
					cy="30"
					r="1.5"
					className="fill-primary"
					variants={circleVariants}
				/>
				<motion.circle
					cx="4"
					cy="23"
					r="1.5"
					className="fill-primary"
					variants={circleVariants}
				/>
				<motion.circle
					cx="4"
					cy="9"
					r="1.5"
					className="fill-primary"
					variants={circleVariants}
				/>
			</motion.g>
		</motion.svg>
	)
}

export function Logo() {
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	// Render static placeholder during SSR to avoid hydration mismatch with framer-motion
	if (!isMounted) {
		return (
			<div className="flex items-center justify-center">
				<Link to="/">
					<div className="group relative flex h-7 w-7 items-center justify-center">
						<div className="relative flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm shadow-lg border border-primary/20">
							<div className="h-5 w-5 rounded-md bg-muted animate-pulse" />
						</div>
					</div>
				</Link>
			</div>
		)
	}

	return (
		<div className="flex items-center justify-center">
			<Link to="/">
				<motion.div
					className="group relative flex h-7 w-7 items-center justify-center"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{
						duration: 0.3,
						ease: [0.76, 0, 0.24, 1],
						delay: 0.2
					}}
				>
					{/* Animated background gradient */}
					<motion.div
						className="absolute inset-0 rounded-md bg-gradient-to-br from-primary/20 via-primary/15 to-primary/10"
						initial={{ opacity: 0 }}
						animate={{ opacity: 0.9 }}
						transition={{ delay: 0.3, duration: 0.5 }}
					/>

					{/* Glowing effect */}
					<motion.div
						className="absolute inset-0 rounded-md bg-primary/5 blur-xl"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.4, duration: 0.5 }}
					/>

					{/* Main icon container */}
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

