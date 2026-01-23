'use client'

import { cn } from "@skriuw/shared";
import { motion, SVGMotionProps } from "framer-motion";
import * as React from "react";

type BrandLogoProps = {
	size?: number
	animated?: boolean
	className?: string
	variant?: 'sidebar' | 'explanation'
} & SVGMotionProps<SVGSVGElement>

export function BrandLogo({
	size = 120,
	animated = true,
	className,
	variant = 'explanation',
	...props
}: BrandLogoProps) {
	const [particles, setParticles] = React.useState<
		Array<{
			id: number
			x: number
			y: number
			vx: number
			vy: number
			life: number
		}>
	>([])

	React.useEffect(() => {
		if (!animated) return

		const interval = setInterval(() => {
			setParticles((prev) => {
				const newParticles = prev
					.map((p) => ({
						...p,
						x: p.x + p.vx,
						y: p.y + p.vy,
						life: p.life - 0.02,
						vy: p.vy + 0.1
					}))
					.filter((p) => p.life > 0)

				if (Math.random() > 0.7 && newParticles.length < 20) {
					const spawnPoints =
						variant === 'sidebar'
							? [
									{ x: 8, y: 20 },
									{ x: 20, y: 20 },
									{ x: 32, y: 20 }
								]
							: [
									{ x: 50, y: 200 },
									{ x: 170, y: 250 },
									{ x: 330, y: 250 }
								]

					const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)]

					newParticles.push({
						id: Date.now() + Math.random(),
						x: spawn.x + (Math.random() - 0.5) * 20,
						y: spawn.y,
						vx: (Math.random() - 0.5) * 2,
						vy: -Math.random() * 3 - 1,
						life: 1
					})
				}

				return newParticles
			})
		}, 50)

		return () => clearInterval(interval)
	}, [animated, variant])

	const variants = {
		hidden: { opacity: 0, scale: 0.8 },
		visible: {
			opacity: 1,
			scale: 1,
			transition: {
				duration: 0.5,
				ease: [0.4, 0, 0.2, 1] as const,
				staggerChildren: 0.1
			}
		},
		hover: {
			scale: 1,
			transition: {
				staggerChildren: 0.1
			}
		}
	}

	const pathVariants = {
		hidden: { opacity: 0, y: 10 },
		visible: (i: number) => ({
			opacity: 1,
			y: 0,
			transition: {
				duration: 0.4,
				delay: i * 0.15,
				ease: [0.4, 0, 0.2, 1] as const
			}
		}),
		hover: {
			opacity: [1, 0.5, 1],
			transition: {
				duration: 0.6,
				ease: [0.4, 0, 0.2, 1] as const
			}
		}
	}

	const Wrapper = (animated ? motion.svg : 'svg') as any
	// @ts-ignore - Dynamic component type safety is tricky here, but valid at runtime
	const Path = animated ? motion.path : 'path'
	// @ts-ignore
	const Rect = animated ? motion.rect : 'rect'

	const isSidebar = variant === 'sidebar'

	return (
		<div className='relative inline-block'>
			<Wrapper
				xmlns='http://www.w3.org/2000/svg'
				viewBox={isSidebar ? '0 0 40 40' : '0 0 390 513'}
				width={size}
				height={size}
				preserveAspectRatio='xMidYMid meet'
				className={cn('text-foreground', className)}
				initial={animated ? 'hidden' : undefined}
				animate={animated ? 'visible' : undefined}
				whileHover={animated ? 'hover' : undefined}
				variants={variants}
				{...props}
			>
				<defs>
					<linearGradient id='logoGradient' x1='0%' y1='0%' x2='100%' y2='100%'>
						<stop offset='0%' stopColor='currentColor' stopOpacity='1' />
						<stop offset='50%' stopColor='currentColor' stopOpacity='0.8' />
						<stop offset='100%' stopColor='currentColor' stopOpacity='1' />
					</linearGradient>
					<filter id='glow'>
						<feGaussianBlur stdDeviation='2' result='coloredBlur' />
						<feMerge>
							<feMergeNode in='coloredBlur' />
							<feMergeNode in='SourceGraphic' />
						</feMerge>
					</filter>
				</defs>
				<g fill='url(#logoGradient)' filter='url(#glow)'>
					{isSidebar ? (
						<>
							<Rect
								x='4'
								y='8'
								width='8'
								height='24'
								rx='1'
								custom={0}
								variants={pathVariants}
							/>
							<Rect
								x='16'
								y='4'
								width='8'
								height='32'
								rx='1'
								custom={1}
								variants={pathVariants}
							/>
							<Rect
								x='28'
								y='12'
								width='8'
								height='16'
								rx='1'
								custom={2}
								variants={pathVariants}
							/>
						</>
					) : (
						<>
							<Path
								d='M6 52 L0 58 L0 391 L8 400 L82 440 L89 441 L94 439 L99 432 L99 104 L94 96 L14 52 Z'
								custom={0}
								variants={pathVariants}
							/>
							<Path
								d='M133 0 L123 8 L123 504 L130 511 L140 512 L237 463 L246 452 L246 64 L234 52 L150 6 Z'
								custom={1}
								variants={pathVariants}
							/>
							<Path
								d='M277 78 L272 83 L272 434 L278 440 L288 440 L378 391 L390 380 L390 139 L379 128 L299 78 Z'
								custom={2}
								variants={pathVariants}
							/>
						</>
					)}
				</g>
				{particles.map((particle) => (
					<circle
						key={particle.id}
						cx={particle.x}
						cy={particle.y}
						r={2}
						fill='currentColor'
						opacity={particle.life * 0.6}
					/>
				))}
			</Wrapper>
		</div>
	)
}
