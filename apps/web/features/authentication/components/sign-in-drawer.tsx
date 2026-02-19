'use client'

import { LoginForm } from './login-form'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'

type SignInDrawerProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	allowClose?: boolean
}

const EASE_SPRING = [0.32, 0.72, 0, 1] as const

export function SignInDrawer({ open, onOpenChange, allowClose = true }: SignInDrawerProps) {
	const y = useMotionValue(0)
	const isDragging = useRef(false)
	const closeButtonRef = useRef<HTMLButtonElement>(null)

	// Lock / unlock body scroll
	useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden'
			// Auto-focus close button for keyboard users
			requestAnimationFrame(() => {
				closeButtonRef.current?.focus()
			})
		} else {
			document.body.style.overflow = ''
		}
		return () => {
			document.body.style.overflow = ''
		}
	}, [open])

	// Escape key
	useEffect(() => {
		if (!open || !allowClose) return
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onOpenChange(false)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, allowClose, onOpenChange])

	const handleBackdropClick = useCallback(() => {
		if (allowClose) onOpenChange(false)
	}, [allowClose, onOpenChange])

	const handleDragStart = useCallback(() => {
		isDragging.current = true
	}, [])

	const handleDrag = useCallback(
		(_: PointerEvent, info: { offset: { y: number } }) => {
			const offset = info.offset.y
			if (offset > 0) {
				// Dragging down — free movement
				y.set(offset)
			} else {
				// Dragging up — logarithmic rubber-band resistance
				const resistance = Math.log10(Math.abs(offset) + 1) * 30 * 0.3
				y.set(-resistance)
			}
		},
		[y]
	)

	const handleDragEnd = useCallback(
		(_: PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) => {
			isDragging.current = false
			const shouldClose =
				allowClose &&
				(info.offset.y > window.innerHeight * 0.15 || info.velocity.y > 500)

			if (shouldClose) {
				onOpenChange(false)
				// Reset after drawer has animated out
				setTimeout(() => y.set(0), 400)
			} else {
				y.set(0)
			}
		},
		[allowClose, onOpenChange, y]
	)

	const isMobile =
		typeof window !== 'undefined' && window.innerWidth <= 768

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					key='sign-in-drawer-root'
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.3 }}
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 50,
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'flex-end',
					}}
				>
					{/* Backdrop */}
					<div
						onClick={handleBackdropClick}
						style={{
							position: 'absolute',
							inset: 0,
							backgroundColor: 'var(--overlay-backdrop, rgba(0,0,0,0.2))',
							backdropFilter: 'blur(3px)',
							WebkitBackdropFilter: 'blur(3px)',
							willChange: 'backdrop-filter',
							contain: 'paint',
						}}
					/>

					{/* Drawer panel */}
					<motion.div
						key='sign-in-drawer-panel'
						drag={isMobile ? 'y' : false}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0.3, bottom: 0.5 }}
						dragListener={isMobile}
						onDragStart={handleDragStart as any}
						onDrag={handleDrag as any}
						onDragEnd={handleDragEnd as any}
						style={{
							y,
							position: 'relative',
							zIndex: 10,
							width: '100%',
							maxWidth: '100%',
							minHeight: '70vh',
							border: 'none',
							boxShadow: 'none',
							backgroundColor: 'transparent',
							pointerEvents: 'none',
							background: 'linear-gradient(to top, var(--background) 0%, var(--background) 80%, transparent 100%)',
						}}
						initial={{ y: '100%' }}
						animate={{ y: 0 }}
						exit={{ y: '100%' }}
						transition={{ duration: 0.4, ease: EASE_SPRING }}
					>
						{/* Mobile drag handle */}
						<div
							style={{
								display: 'flex',
								justifyContent: 'center',
								paddingTop: '0.75rem',
								paddingBottom: '0.25rem',
							}}
						>
							<div
								style={{
									width: '2.5rem',
									height: '0.25rem',
									borderRadius: '9999px',
									backgroundColor: 'var(--muted-foreground)',
									opacity: 0.3,
								}}
							/>
						</div>

						{/* Content wrapper — re-enables pointer events */}
						<div
							style={{
								pointerEvents: 'auto',
								position: 'relative',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								paddingBottom: '3rem',
							}}
						>
							{/* Close button — floats above the form */}
							{allowClose && (
								<div
									style={{
										width: '100%',
										maxWidth: '28rem',
										position: 'relative',
										marginBottom: '0.5rem',
									}}
								>
									<button
										ref={closeButtonRef}
										onClick={() => onOpenChange(false)}
										aria-label='Close sign-in panel'
										style={{
											position: 'absolute',
											top: '-3rem',
											right: 0,
											padding: '0.5rem',
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
										}}
									>
										<X size={16} />
									</button>
								</div>
							)}

							{/* Form */}
							<div
								style={{
									width: '100%',
									maxWidth: '28rem',
									background: 'transparent',
									padding: '1rem',
								}}
							>
								<LoginForm
									title='Welcome back'
									subtitle='Sign in to sync your notes across devices'
									onSuccess={() => onOpenChange(false)}
								/>
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
