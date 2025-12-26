'use client'

import * as React from 'react'
import { motion, SVGMotionProps } from 'framer-motion'
import { RawLogo } from './raw-logo'

interface BrandLogoProps extends SVGMotionProps<SVGSVGElement> {
	size?: number
	animated?: boolean
	className?: string
	variant?: 'sidebar' | 'explanation'
}

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

					const spawn =
						spawnPoints[
							Math.floor(Math.random() * spawnPoints.length)
						]

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

	const Wrapper = (animated ? motion.svg : 'svg') as any

	return (
		<div className="relative inline-block">
			<Wrapper
				initial={animated ? 'hidden' : undefined}
				animate={animated ? 'visible' : undefined}
				whileHover={animated ? 'hover' : undefined}
				variants={variants}
				{...props}
			>
				<RawLogo size={size} variant={variant} className={className} />
			</Wrapper>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox={variant === 'sidebar' ? '0 0 40 40' : '0 0 390 513'}
				width={size}
				height={size}
				preserveAspectRatio="xMidYMid meet"
				className="absolute inset-0 pointer-events-none"
			>
				{particles.map((particle) => (
					<circle
						key={particle.id}
						cx={particle.x}
						cy={particle.y}
						r={2}
						fill="currentColor"
						opacity={particle.life * 0.6}
					/>
				))}
			</svg>
		</div>
	)
}
