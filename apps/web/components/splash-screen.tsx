'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

import BlurTextAnimation from './blur-text-animation'

type SplashScreenProps = {
	show: boolean
	onAnimationComplete?: () => void
}

export function SplashScreen({ show, onAnimationComplete }: SplashScreenProps) {
	const [titleComplete, setTitleComplete] = useState(false)
	const [subtitleComplete, setSubtitleComplete] = useState(false)

	useEffect(() => {
		if (titleComplete && subtitleComplete && onAnimationComplete) {
			onAnimationComplete()
		}
	}, [titleComplete, subtitleComplete, onAnimationComplete])

	return (
		<AnimatePresence>
			{show && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.5, ease: 'easeInOut' }}
					className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
				>
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 }}
						className="flex flex-col items-center gap-3"
					>
						<motion.div
							exit={{ scale: 0.9, opacity: 0 }}
							transition={{ duration: 0.4, ease: 'easeOut' }}
						>
							<BlurTextAnimation
								text="Skriuw"
								className="mb-2"
								fontSize="text-6xl"
								textColor="text-foreground"
								textClassName="font-bold font-brand"
								animationDelay={4000}
								loop={false}
								onComplete={() => setTitleComplete(true)}
							/>
						</motion.div>
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
							exit={{ opacity: 0 }}
						>
							<BlurTextAnimation
								text={'/skrɪu̯/ — Frisian, "to write."'}
								fontSize="text-sm"
								textColor="text-muted-foreground"
								textClassName="italic"
								animationDelay={4000}
								loop={false}
								onComplete={() => setSubtitleComplete(true)}
							/>
						</motion.div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
