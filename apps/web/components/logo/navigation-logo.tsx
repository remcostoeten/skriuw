'use client'

import { RawLogo } from './raw-logo'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function NavigationLogo() {
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	const placeholder = (
		<div className='group relative flex h-7 w-7 items-center justify-center'>
			<div className='relative flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm shadow-lg border border-primary/20'>
				<div className='h-5 w-5 rounded-md bg-muted animate-pulse' />
			</div>
		</div>
	)

	if (!isMounted) {
		return (
			<div className='flex items-center justify-center'>
				<Link href='/'>{placeholder}</Link>
			</div>
		)
	}

	return (
		<div className='flex items-center justify-center'>
			<Link href='/'>
				<motion.div
					className='group relative flex h-7 w-7 items-center justify-center'
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{
						duration: 0.3,
						ease: [0.76, 0, 0.24, 1],
						delay: 0.2
					}}
				>
					<motion.div
						className='absolute inset-0 rounded-md bg-gradient-to-br from-primary/20 via-primary/15 to-primary/10'
						initial={{ opacity: 0 }}
						animate={{ opacity: 0.9 }}
						transition={{ delay: 0.3, duration: 0.5 }}
					/>
					<motion.div
						className='absolute inset-0 rounded-md bg-primary/5 blur-xl'
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.4, duration: 0.5 }}
					/>
					<motion.div
						className='relative flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm shadow-lg border border-primary/20'
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.5, duration: 0.5 }}
					>
						<RawLogo
							size={20}
							variant='sidebar'
							className='text-primary transition-all duration-300'
						/>
					</motion.div>
				</motion.div>
			</Link>
		</div>
	)
}
