'use client'

import { LoginForm } from './login-form'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue } from 'framer-motion'

const DRAWER_STYLES = {
	background: `linear-gradient(to top, var(--background) 0%, var(--background) 80%, transparent 100%)`
}

const styles = {
	overlay: {
		position: 'fixed' as const,
		inset: 0,
		zIndex: 50,
		display: 'flex',
		flexDirection: 'column' as const,
		justifyContent: 'flex-end',
		alignItems: 'center'
	},
	backdrop: {
		position: 'absolute' as const,
		inset: 0,
		backgroundColor: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.2))',
		backdropFilter: 'blur(3px)',
		WebkitBackdropFilter: 'blur(3px)',
		willChange: 'backdrop-filter',
		contain: 'paint' as const
	},
	drawer: {
		position: 'relative' as const,
		zIndex: 10,
		width: '100%',
		maxWidth: '100%',
		minHeight: '70vh',
		display: 'flex',
		flexDirection: 'column' as const,
		justifyContent: 'flex-end',
		alignItems: 'center',
		paddingBottom: '2rem',
		background: DRAWER_STYLES.background,
		border: 'none',
		boxShadow: 'none',
		pointerEvents: 'none' as const
	},
	dragHandle: {
		position: 'sticky' as const,
		top: 0,
		width: '100%',
		zIndex: 3,
		paddingTop: '0.75rem',
		paddingBottom: '0.5rem',
		display: 'flex',
		justifyContent: 'center',
		pointerEvents: 'auto' as const,
		cursor: 'grab'
	},
	dragHandleBar: {
		width: '2.5rem',
		height: '0.25rem',
		borderRadius: '9999px',
		backgroundColor: 'var(--muted-foreground)',
		opacity: 0.3
	},
	contentWrapper: {
		width: '100%',
		maxWidth: '28rem',
		position: 'relative' as const,
		backgroundColor: 'transparent',
		padding: '1rem',
		pointerEvents: 'auto' as const
	},
	closeButton: {
		position: 'absolute' as const,
		top: '-3rem',
		right: '0',
		padding: '0.5rem',
		borderRadius: '0.5rem',
		backgroundColor: 'var(--muted)',
		border: '1px solid var(--border)',
		cursor: 'pointer',
		color: 'var(--muted-foreground)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		backdropFilter: 'blur(4px)'
	}
}

type SignInDrawerProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	allowClose?: boolean
}

export function SignInDrawer({ open, onOpenChange, allowClose = true }: SignInDrawerProps) {
	const dragY = useMotionValue(0)
	const isDraggingRef = useRef(false)
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const [isMobile, setIsMobile] = useState(false)

	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth <= 768)
		check()
		window.addEventListener('resize', check)
		return () => window.removeEventListener('resize', check)
	}, [])

	useEffect(() => {
		if (open && closeButtonRef.current && allowClose) {
			requestAnimationFrame(() => closeButtonRef.current?.focus())
		}
	}, [open, allowClose])

	useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden'
		} else {
			document.body.style.overflow = ''
		}
		return () => {
			document.body.style.overflow = ''
		}
	}, [open])

	useEffect(() => {
		if (!open || !allowClose) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onOpenChange(false)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, allowClose, onOpenChange])

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
			isDraggingRef.current = false
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
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.3 }}
					style={styles.overlay}
				>
					{/* Blurred backdrop */}
					<div
						style={styles.backdrop}
						onClick={allowClose ? () => onOpenChange(false) : undefined}
					/>

					{/* Gradient Drawer */}
					<motion.div
						initial={{ y: '100%' }}
						animate={{ y: 0 }}
						exit={{ y: '100%' }}
						transition={
							isDraggingRef.current
								? { duration: 0 }
								: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
						}
						drag={isMobile && allowClose ? 'y' : false}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0.1, bottom: 0.5 }}
						onDragStart={() => {
							isDraggingRef.current = true
						}}
						onDrag={handleDrag as any}
						onDragEnd={handleDragEnd as any}
						style={{
							...styles.drawer,
							y: isMobile ? dragY : 0,
							cursor: isMobile ? 'grab' : 'default'
						}}
					>
						{/* Mobile drag handle */}
						{isMobile && allowClose && (
							<div style={styles.dragHandle}>
								<div style={styles.dragHandleBar} aria-label="Drag to close" />
							</div>
						)}

						<div style={styles.contentWrapper}>
							{allowClose && (
								<button
									ref={closeButtonRef}
									onClick={() => onOpenChange(false)}
									style={styles.closeButton}
									aria-label="Close"
								>
									<X style={{ width: 20, height: 20 }} />
								</button>
							)}

							<LoginForm
								onSuccess={() => onOpenChange(false)}
							/>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
