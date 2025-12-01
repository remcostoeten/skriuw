import React, { useState, useEffect } from 'react'

interface ThemeToggleProps {
	size?: 'sm' | 'md' | 'lg' | number
	onChange?: (isDark: boolean) => void
	defaultTheme?: 'light' | 'dark'
	isDark?: boolean
}

export function ThemeToggle({
	size = 'md',
	onChange,
	defaultTheme = 'light',
	isDark: controlledIsDark,
}: ThemeToggleProps) {
	const [internalIsDark, setInternalIsDark] = useState(defaultTheme === 'dark')
	const isDark = controlledIsDark !== undefined ? controlledIsDark : internalIsDark

	useEffect(() => {
		if (controlledIsDark !== undefined) {
			setInternalIsDark(controlledIsDark)
		}
	}, [controlledIsDark])

	const sizeMap = {
		sm: 48,
		md: 96,
		lg: 200,
	}

	const containerSize = typeof size === 'number' ? size : sizeMap[size]
	const borderWidth = Math.max(2, containerSize * 0.028)

	const handleClick = () => {
		const newTheme = !isDark
		// Only update internal state if not controlled
		if (controlledIsDark === undefined) {
			setInternalIsDark(newTheme)
		}
		onChange?.(newTheme)
	}

	return (
		<>
			<style>{`
				@keyframes sunRotateIn {
					0% {
						transform: rotate(50deg) translateZ(0);
						opacity: 0;
					}
					100% {
						transform: rotate(0) translateZ(0);
						opacity: 1;
					}
				}

				@keyframes sunRotateOut {
					0% {
						transform: rotate(0deg) translateZ(0);
						opacity: 1;
					}
					100% {
						transform: rotate(-80deg) translateZ(0);
						opacity: 0;
					}
				}

				@keyframes moonRotateOut {
					0% {
						transform: rotate(0deg) translateZ(0);
						opacity: 0;
					}
					100% {
						transform: rotate(80deg) translateZ(0);
						opacity: 0;
					}
				}

				@keyframes moonRotateIn {
					0% {
						transform: rotate(-80deg) translateZ(0);
						opacity: 0;
					}
					100% {
						transform: rotate(0deg) translateZ(0);
						opacity: 1;
					}
				}
			`}</style>

			<button
				onClick={handleClick}
				className="relative overflow-hidden rounded-full cursor-pointer p-0 border-0 bg-transparent transition-transform hover:scale-105 active:scale-95"
				style={{
					width: containerSize,
					height: containerSize,
				}}
				aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
			>
				{/* Background circle - subtle gradient using theme colors */}
				<div
					className="absolute inset-0 rounded-full transition-all duration-700"
					style={{
						background: isDark
							? 'hsl(var(--muted))'
							: 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--muted-foreground) / 0.3))',
					}}
				/>

				{/* Sun - visible in light mode */}
				<div
					className="absolute rounded-full"
					style={{
						left: '66%',
						top: '25%',
						width: '13.5%',
						height: '13.5%',
						backgroundColor: 'hsl(var(--foreground))',
						transformOrigin: '-200% 421%',
						animation: isDark ? 'sunRotateOut 0.6s both ease-out' : 'sunRotateIn 0.6s both ease-out',
					}}
				/>

				{/* Moon - visible in dark mode */}
				<div
					className="absolute rounded-full"
					style={{
						left: '66%',
						top: '25%',
						width: '13.5%',
						height: '13.5%',
						marginLeft: `calc(${containerSize * 0.057}px * -1)`,
						marginTop: `calc(${containerSize * 0.017}px * -1)`,
						transformOrigin: '-200% 421%',
						animation: isDark ? 'moonRotateIn 0.6s both ease-out' : 'moonRotateOut 0.6s both ease-out',
					}}
				>
					<div
						className="absolute inset-0 rounded-full"
						style={{
							boxShadow: `${containerSize * 0.057}px ${containerSize * 0.017}px 0 0 hsl(var(--foreground))`,
						}}
					/>
				</div>

				{/* Sun rays - light mode */}
				<div
					className="absolute inset-0 transition-all duration-500"
					style={{
						opacity: isDark ? 0 : 1,
						transform: isDark ? 'scale(0.8) translateZ(0)' : 'scale(1) translateZ(0)',
					}}
				>
					<div
						className="absolute rounded-sm"
						style={{
							width: '60%',
							height: '60%',
							backgroundColor: 'hsl(var(--muted-foreground) / 0.4)',
							bottom: '-21%',
							right: '5%',
							transform: 'scaleX(0.95) rotate(45deg) translateZ(0)',
						}}
					/>
				</div>

				{/* Moon craters - dark mode */}
				<div
					className="absolute inset-0 transition-all duration-500"
					style={{
						opacity: isDark ? 1 : 0,
						transform: isDark ? 'scale(1) translateZ(0)' : 'scale(0.8) translateZ(0)',
					}}
				>
					<div
						className="absolute rounded-sm"
						style={{
							width: '60%',
							height: '60%',
							backgroundColor: 'hsl(var(--muted-foreground) / 0.3)',
							bottom: '-12%',
							left: '10%',
							transform: 'scaleX(0.85) rotate(45deg) translateZ(0)',
						}}
					/>
					<div
						className="absolute rounded-sm"
						style={{
							width: '60%',
							height: '60%',
							backgroundColor: 'hsl(var(--muted-foreground) / 0.3)',
							bottom: '-30%',
							left: '25.5%',
							transform: 'scaleX(0.85) rotate(45deg) translateZ(0)',
						}}
					/>
				</div>

				{/* Border - using theme border color */}
				<div
					className="absolute inset-0 rounded-full transition-all duration-700 pointer-events-none"
					style={{
						border: `${borderWidth}px solid hsl(var(--border) / ${isDark ? 0.4 : 0.3})`,
					}}
				/>
			</button>
		</>
	)
}

