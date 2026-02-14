'use client'

import { LoginForm } from './login-form'
import { useMediaQuery } from '@skriuw/shared/client'
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

type Props = {
	isOpen: boolean
	onClose?: () => void
	onSuccess?: () => void
	allowClose?: boolean
}

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

export function AuthOverlay({ isOpen, onClose, onSuccess, allowClose = true }: Props) {
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const isMobile = useMediaQuery('(max-width: 768px)')
	const y = useMotionValue(0)

	useEffect(() => {
		if (isOpen && closeButtonRef.current && allowClose) {
			closeButtonRef.current.focus()
		}
	}, [isOpen, allowClose])

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isOpen && allowClose && onClose) {
				onClose()
			}
		}
		document.addEventListener('keydown', handleEscape)
		return () => document.removeEventListener('keydown', handleEscape)
	}, [isOpen, allowClose, onClose])

	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden'
		} else {
			document.body.style.overflow = ''
		}
		return () => {
			document.body.style.overflow = ''
		}
	}, [isOpen])

	useEffect(() => {
		if (!isOpen) y.set(0)
	}, [isOpen, y])

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.3 }}
					style={styles.overlay}
				>
					<div
						style={styles.backdrop}
						onClick={allowClose && onClose ? onClose : undefined}
					/>

					<motion.div
						initial={{ y: '100%' }}
						animate={{ y: 0 }}
						exit={{ y: '100%' }}
						transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
						drag={isMobile && allowClose ? 'y' : false}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={0.2}
						onDragEnd={(_, info) => {
							if (!isMobile || !allowClose) return
							const shouldClose =
								info.offset.y > window.innerHeight * 0.15 || info.velocity.y > 500
							if (shouldClose) {
								onClose?.()
								return
							}
							animate(y, 0, { duration: 0.2, ease: 'easeOut' })
						}}
						style={{
							...styles.drawer,
							y
						}}
					>
						{isMobile && allowClose && (
							<div style={styles.dragHandle}>
								<div style={styles.dragHandleBar} aria-label='Drag to close' />
							</div>
						)}

						<div style={styles.contentWrapper}>
							{allowClose && onClose && (
								<button
									ref={closeButtonRef}
									onClick={onClose}
									style={styles.closeButton}
									aria-label='Close'
								>
									<X style={{ width: 20, height: 20 }} />
								</button>
							)}

							<LoginForm
								onSuccess={() => {
									onSuccess?.()
									onClose?.()
								}}
							/>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
