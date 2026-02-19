'use client'

import { LoginForm } from './login-form'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

function LogoMark() {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '3rem',
				height: '3rem',
				borderRadius: '0.875rem',
				background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)',
				border: '1px solid rgba(255,255,255,0.15)',
				backdropFilter: 'blur(8px)',
				WebkitBackdropFilter: 'blur(8px)',
				boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
			}}
		>
			<svg
				viewBox="0 0 40 40"
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
				style={{ width: '1.375rem', height: '1.375rem', color: 'var(--foreground)' }}
			>
				<rect x="4" y="8" width="8" height="24" rx="1" />
				<rect x="16" y="4" width="8" height="32" rx="1" />
				<rect x="28" y="12" width="8" height="16" rx="1" />
			</svg>
		</div>
	)
}

type SignInDrawerProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	allowClose?: boolean
}

const EASE_SPRING = [0.32, 0.72, 0, 1] as const

export function SignInDrawer({ open, onOpenChange, allowClose = true }: SignInDrawerProps) {
	const dragY = useMotionValue(0)
	const isDragging = useRef(false)
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const [isMobile, setIsMobile] = useState(false)

	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth <= 768)
		check()
		window.addEventListener('resize', check)
		return () => window.removeEventListener('resize', check)
	}, [])

	useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden'
			requestAnimationFrame(() => closeButtonRef.current?.focus())
		} else {
			document.body.style.overflow = ''
		}
		return () => { document.body.style.overflow = '' }
	}, [open])

	useEffect(() => {
		if (!open || !allowClose) return
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, allowClose, onOpenChange])

	const handleBackdropClick = useCallback(() => {
		if (allowClose) onOpenChange(false)
	}, [allowClose, onOpenChange])

	const handleDrag = useCallback(
		(_: PointerEvent, info: { offset: { y: number } }) => {
			const offset = info.offset.y
			if (offset > 0) {
				dragY.set(offset)
			} else {
				const resistance = Math.log10(Math.abs(offset) + 1) * 30 * 0.3
				dragY.set(-resistance)
			}
		},
		[dragY]
	)

	const handleDragEnd = useCallback(
		(_: PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) => {
			isDragging.current = false
			const shouldClose =
				allowClose &&
				(info.offset.y > window.innerHeight * 0.15 || info.velocity.y > 500)
			if (shouldClose) {
				onOpenChange(false)
				setTimeout(() => dragY.set(0), 400)
			} else {
				dragY.set(0)
			}
		},
		[allowClose, onOpenChange, dragY]
	)

	return (
		<AnimatePresence>
			{open && (
				<div
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 9999,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					{/* Blurred dim backdrop */}
					<motion.div
						key="backdrop"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
						onClick={handleBackdropClick}
						style={{
							position: 'absolute',
							inset: 0,
							backgroundColor: 'rgba(0,0,0,0.55)',
							backdropFilter: 'blur(6px)',
							WebkitBackdropFilter: 'blur(6px)',
							zIndex: 0,
						}}
					/>

					{/* Panel */}
					<motion.div
						key="panel"
						initial={{ opacity: 0, scale: 0.97, y: 16 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.97, y: 16 }}
						transition={{ duration: 0.35, ease: EASE_SPRING }}
						drag={isMobile ? 'y' : false}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0.2, bottom: 0.5 }}
						onDragStart={() => { isDragging.current = true }}
						onDrag={handleDrag as any}
						onDragEnd={handleDragEnd as any}
						style={{
							y: dragY,
							position: 'relative',
							zIndex: 1,
							width: '100%',
							maxWidth: '30rem',
							margin: '0 auto',
							/* transparent at top → solid background at ~30% down */
							background:
									'linear-gradient(to bottom, transparent 0%, var(--background) 22%, var(--background) 100%)',
							border: 'none',
							boxShadow: 'none',
							borderRadius: '1rem',
							padding: '0 0 2.5rem 0',
							/* clicks pass through the transparent top strip */
							pointerEvents: 'none',
						}}
					>
						{/* Mobile drag handle */}
						{isMobile && (
							<div
								style={{
									display: 'flex',
									justifyContent: 'center',
									paddingTop: '0.625rem',
									paddingBottom: '0.25rem',
									pointerEvents: 'auto',
								}}
							>
								<div
									style={{
										width: '2.5rem',
										height: '0.25rem',
										borderRadius: '9999px',
										backgroundColor: 'var(--muted-foreground)',
										opacity: 0.35,
									}}
								/>
							</div>
						)}

						{/* Logo — floats in the transparent gradient zone */}
						<div
							style={{
								display: 'flex',
								justifyContent: 'center',
								paddingTop: '2rem',
								paddingBottom: '1rem',
								pointerEvents: 'none',
							}}
						>
							<LogoMark />
						</div>

						{/* Re-enable pointer events on the solid content zone */}
						<div style={{ pointerEvents: 'auto', position: 'relative' }}>
							{/* Close button — absolute top-right of the content zone */}
							{allowClose && (
								<button
									ref={closeButtonRef}
									onClick={() => onOpenChange(false)}
									aria-label="Close sign-in panel"
									style={{
										position: 'absolute',
										top: '-3.5rem',
										right: '0.75rem',
										padding: '0.4rem',
										borderRadius: '0.5rem',
										backgroundColor: 'var(--muted)',
										border: '1px solid var(--border)',
										backdropFilter: 'blur(4px)',
										WebkitBackdropFilter: 'blur(4px)',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										color: 'var(--foreground)',
										lineHeight: 1,
										zIndex: 10,
									}}
								>
									<X size={16} />
								</button>
							)}

							{/* Form content */}
							<div
								style={{
									width: '100%',
									maxWidth: '28rem',
									margin: '0 auto',
									padding: '0.5rem 1.5rem 0',
								}}
							>
								<LoginForm
									title="Welcome back"
									subtitle="Sign in to sync your notes across devices"
									onSuccess={() => onOpenChange(false)}
								/>
							</div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	)
}
