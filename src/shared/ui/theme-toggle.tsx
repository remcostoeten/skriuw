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
				@keyframes loopIn {
					0% {
						transform: rotate(50deg) translateZ(0);
					}
					100% {
						transform: rotate(0) translateZ(0);
					}
				}

				@keyframes loopOut {
					0% {
						transform: rotate(0deg) translateZ(0);
					}
					100% {
						transform: rotate(-80deg) translateZ(0);
					}
				}

				@keyframes loopOutMoon {
					0% {
						transform: rotate(0deg) translateZ(0);
					}
					100% {
						transform: rotate(80deg) translateZ(0);
					}
				}

				@keyframes loopInMoon {
					0% {
						transform: rotate(0deg) translateZ(0);
					}
					100% {
						transform: rotate(0deg) translateZ(0);
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
				<div
					className="absolute inset-0 rounded-full transition-all duration-1000"
					style={{
						background: isDark
							? 'linear-gradient(hsl(var(--muted)), hsl(var(--muted-foreground) / 0.3), hsl(var(--muted)))'
							: 'linear-gradient(hsl(var(--muted-foreground) / 0.4), hsl(var(--muted-foreground) / 0.6), hsl(var(--muted)))',
						backgroundSize: '100% 500%',
						backgroundPosition: isDark ? 'left 85%' : 'top left',
					}}
				/>

				<div
					className="absolute rounded-full"
					style={{
						left: '66%',
						top: '25%',
						width: '13.5%',
						height: '13.5%',
						backgroundColor: 'hsl(var(--muted-foreground))',
						transformOrigin: '-200% 421%',
						animation: isDark ? 'loopOut 0.65s both linear' : 'loopIn 0.6s both ease-out',
					}}
				/>

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
						animation: isDark ? 'loopIn 0.6s both ease-out' : 'loopOut 0.65s both linear',
					}}
				>
					<div
						className="absolute inset-0 rounded-full"
						style={{
							boxShadow: `${containerSize * 0.057}px ${containerSize * 0.017}px 0 0 hsl(var(--muted-foreground))`,
							animation: isDark ? 'loopInMoon 0.6s both ease-out' : 'loopOutMoon 0.65s both linear',
						}}
					/>
				</div>

				<div
					className="absolute inset-0 transition-transform duration-400"
					style={{
						transform: isDark ? 'translateX(3%) translateZ(0)' : 'translateX(0) translateZ(0)',
					}}
				>
					<div
						className="absolute rounded-[10%]"
						style={{
							width: '60%',
							height: '60%',
							backgroundColor: 'hsl(var(--muted-foreground))',
							opacity: 0.8,
							bottom: '-21%',
							right: '5%',
							transform: 'scaleX(0.95) rotate(45deg) translateZ(0)',
						}}
					/>
				</div>

				<div
					className="absolute inset-0 transition-transform duration-400"
					style={{
						transform: isDark
							? 'scale(1.4) translateX(2%) translateZ(0)'
							: 'scale(1) translateX(0) translateZ(0)',
					}}
				>
					<div
						className="absolute rounded-[10%]"
						style={{
							width: '60%',
							height: '60%',
							backgroundColor: 'hsl(var(--muted-foreground))',
							bottom: '-12%',
							left: '10%',
							transform: 'scaleX(0.85) rotate(45deg) translateZ(0)',
						}}
					/>
					<div
						className="absolute rounded-[10%]"
						style={{
							width: '60%',
							height: '60%',
							backgroundColor: 'hsl(var(--muted-foreground))',
							bottom: '-30%',
							left: '25.5%',
							transform: 'scaleX(0.85) rotate(45deg) translateZ(0)',
						}}
					/>
				</div>

				<div
					className="absolute inset-0 rounded-full transition-all duration-1000 pointer-events-none"
					style={{
						border: `${borderWidth}px solid hsl(var(--border) / 0.2)`,
					}}
				/>
			</button>
		</>
	)
}

