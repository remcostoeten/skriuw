'use client'

import { LoginForm } from './login-form'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

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

	// Lock / unlock body scroll
	useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden'
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
				// Full-screen fixed overlay — flex column, bottom-anchored
				<div
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 9999,
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'flex-end',
						// Prevents click-through on the overlay itself
						pointerEvents: 'auto',
					}}
				>
					{/* Backdrop — behind everything, clickable to close */}
					<motion.div
						key='backdrop'
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
						onClick={handleBackdropClick}
						style={{
							position: 'absolute',
							inset: 0,
							backgroundColor: 'rgba(0,0,0,0.25)',
							backdropFilter: 'blur(3px)',
							WebkitBackdropFilter: 'blur(3px)',
							willChange: 'backdrop-filter',
							zIndex: 0,
						}}
					/>

					{/*
					 * Drawer panel — slides up from below.
					 * Separated from the drag MotionValue so initial/animate/exit
					 * y-transforms don't conflict with the drag offset.
					 */}
					<motion.div
						key='drawer'
						initial={{ y: '100%' }}
						animate={{ y: 0 }}
						exit={{ y: '100%' }}
						transition={{ duration: 0.4, ease: EASE_SPRING }}
						style={{
							position: 'relative',
							zIndex: 1,
							width: '100%',
							// Gradient: solid page bg from bottom 0%→80%, fades to transparent at top
							background:
								'linear-gradient(to top, var(--background) 0%, var(--background) 75%, transparent 100%)',
							// No hard edges
							border: 'none',
							boxShadow: 'none',
							// Let clicks pass through the transparent top gradient zone
							pointerEvents: 'none',
						}}
					>
						{/*
						 * Inner drag wrapper — separate motion element so the drag
						 * MotionValue (dragY) is never mixed with the slide animation above.
						 */}
						<motion.div
							drag={isMobile ? 'y' : false}
							dragConstraints={{ top: 0, bottom: 0 }}
							dragElastic={{ top: 0.3, bottom: 0.5 }}
							onDrag={handleDrag as any}
							onDragEnd={handleDragEnd as any}
							onDragStart={() => { isDragging.current = true }}
							style={{
								y: dragY,
								width: '100%',
								pointerEvents: 'none',
							}}
						>
							{/* Transparent spacer — creates the gradient fade-in zone */}
							<div style={{ height: '15vh', pointerEvents: 'none' }} />

							{/* Opaque content zone — everything visible lives here */}
							<div
								style={{
									pointerEvents: 'auto',
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
									// Scrollable so tall forms don't overflow
									overflowY: 'auto',
									maxHeight: '85vh',
									paddingBottom: '3rem',
									// Pull it into the gradient zone slightly
									marginTop: '-2px',
								}}
							>
								{/* Mobile drag handle pill */}
								<div
									style={{
										display: 'flex',
										justifyContent: 'center',
										width: '100%',
										paddingTop: '0.75rem',
										paddingBottom: '0.5rem',
										flexShrink: 0,
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

								{/* Close button row */}
								{allowClose && (
									<div
										style={{
											width: '100%',
											maxWidth: '28rem',
											display: 'flex',
											justifyContent: 'flex-end',
											paddingRight: '1rem',
											paddingBottom: '0.5rem',
											flexShrink: 0,
										}}
									>
										<button
											ref={closeButtonRef}
											onClick={() => onOpenChange(false)}
											aria-label='Close sign-in panel'
											style={{
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
										padding: '0 1rem',
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
				</div>
			)}
		</AnimatePresence>
	)
}
