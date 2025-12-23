'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { motionDuration, motionEase } from '../utilities/motion-config'

type Props = {
	children: ReactNode
	delay?: number
}

export function MotionPanel({ children, delay = 0 }: Props) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -8 }}
			transition={{ duration: motionDuration, ease: motionEase, delay }}
			className="will-change-transform"
		>
			{children}
		</motion.div>
	)
}
