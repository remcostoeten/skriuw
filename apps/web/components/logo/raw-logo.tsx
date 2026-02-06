'use client'

import { cn } from '@skriuw/shared'
import * as React from 'react'

type RawLogoProps = {
	size?: number
	variant?: 'sidebar' | 'explanation'
	className?: string
} & React.SVGProps<SVGSVGElement>

export function RawLogo({
	size = 120,
	variant = 'explanation',
	className,
	...props
}: RawLogoProps) {
	const isSidebar = variant === 'sidebar'

	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			viewBox={isSidebar ? '0 0 40 40' : '0 0 390 513'}
			width={size}
			height={size}
			preserveAspectRatio='xMidYMid meet'
			className={cn('text-foreground', className)}
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
						<rect x='4' y='8' width='8' height='24' rx='1' />
						<rect x='16' y='4' width='8' height='32' rx='1' />
						<rect x='28' y='12' width='8' height='16' rx='1' />
					</>
				) : (
					<>
						<path d='M6 52 L0 58 L0 391 L8 400 L82 440 L89 441 L94 439 L99 432 L99 104 L94 96 L14 52 Z' />
						<path d='M133 0 L123 8 L123 504 L130 511 L140 512 L237 463 L246 452 L246 64 L234 52 L150 6 Z' />
						<path d='M277 78 L272 83 L272 434 L278 440 L288 440 L378 391 L390 380 L390 139 L379 128 L299 78 Z' />
					</>
				)}
			</g>
		</svg>
	)
}
