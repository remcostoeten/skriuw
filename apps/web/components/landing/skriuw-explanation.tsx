'use client'

import { motion } from 'framer-motion'
import { Button, Kbd } from '@skriuw/ui'
import { BrandLogo } from '../brand-logo'

type Props = {
	onCreateNote: () => void
}

function openCommandExecutor() {
	// Dispatch synthetic Cmd+P event to trigger the command executor
	const event = new KeyboardEvent('keydown', {
		key: 'p',
		code: 'KeyP',
		ctrlKey: navigator.platform.includes('Mac') ? false : true,
		metaKey: navigator.platform.includes('Mac') ? true : false,
		bubbles: true
	})
	window.dispatchEvent(event)
}

export function SkriuwExplanation({ onCreateNote }: Props) {
	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.15,
				delayChildren: 0.2
			}
		}
	}

	const itemVariants = {
		hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
		visible: {
			opacity: 1,
			y: 0,
			filter: 'blur(0px)',
			transition: {
				duration: 0.6,
				ease: [0.4, 0, 0.2, 1] as const
			}
		}
	}

	return (
		<motion.span
			variants={containerVariants}
			initial={false}
			animate="visible"
		>
			<div className="flex flex-col items-center gap-6 mb-8">
				<div className="flex flex-col items-center gap-3">
					<motion.div variants={itemVariants} className="relative">
						<div className="absolute inset-0 blur-3xl bg-primary/20 rounded-full scale-150" />
						<BrandLogo
							size={140}
							className="mb-4 text-foreground relative z-10"
						/>
					</motion.div>
					<motion.h1
						variants={itemVariants}
						className="text-5xl font-bold text-foreground tracking-tight font-serif"
					>
						Skriuw
					</motion.h1>
					<motion.div
						variants={itemVariants}
						className="flex flex-col items-center gap-1 text-muted-foreground"
					>
						<p className="text-sm italic">
							<span className="font-mono text-base">/skrɪu̯/</span>{' '}
							—{' '}
							<span className="font-medium">
								Frisian, &quot;to write.&quot;
							</span>
						</p>
					</motion.div>
				</div>

				<motion.div
					variants={itemVariants}
					className="prose prose-sm dark:prose-invert max-w-lg text-center prose-p:text-muted-foreground"
				>
					<p>
						A blazingly fast, privacy-focused note-taking app built
						for everyone. Providing an opt-in system for all
						features (yes, AI is included) rather than the usual
						opt-out system. The tools are here, you just need to
						opt-in.
					</p>
				</motion.div>
			</div>

			<motion.div
				variants={itemVariants}
				className="flex flex-col sm:flex-row items-center gap-4 mt-8"
			>
				<motion.div
					whileHover={{ scale: 1.02 }}
					whileTap={{ scale: 0.98 }}
				>
					<Button
						variant="outline"
						size="lg"
						onClick={openCommandExecutor}
						className="px-8 py-6 gap-3 text-base bg-background/50 backdrop-blur-sm border-2 border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all duration-300 shadow-lg hover:shadow-xl group relative overflow-hidden"
					>
						<span className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
						<span className="relative">Commands</span>
						<Kbd className="ml-2 relative bg-muted/80 border-border/50">
							⌘P
						</Kbd>
					</Button>
				</motion.div>
				<motion.div
					whileHover={{ scale: 1.02 }}
					whileTap={{ scale: 0.98 }}
				>
					<Button
						variant="default"
						size="lg"
						onClick={onCreateNote}
						className="px-8 py-6 gap-3 text-base shadow-2xl shadow-primary/30 hover:shadow-primary/40 transition-all duration-300 bg-gradient-to-br from-primary to-primary/90 hover:from-primary hover:to-primary/80 group relative overflow-hidden"
					>
						<span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
						<span className="relative font-semibold">
							Create Note
						</span>
						<Kbd className="ml-2 relative bg-primary-foreground/20 text-primary-foreground border border-primary-foreground/20">
							⌘N
						</Kbd>
					</Button>
				</motion.div>
			</motion.div>
		</motion.span>
	)
}
