import { Button, Kbd } from '@skriuw/ui'
import { BrandLogo } from '../brand-logo'

type Props = {
	onCreateNote: () => void
	onOpenCollection: () => void
}

import { motion } from 'framer-motion'

export function SkriuwExplanation({ onCreateNote, onOpenCollection }: Props) {
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
				duration: 0.8,
				ease: [0.2, 0.65, 0.3, 0.9]
			}
		}
	}

	return (
		<motion.div
			className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<div className="flex flex-col items-center gap-6 mb-8">
				<div className="flex flex-col items-center gap-3">
					<motion.div variants={itemVariants}>
						<BrandLogo size={120} className="mb-4" />
					</motion.div>
					<motion.h1
						variants={itemVariants}
						className="text-4xl font-bold text-foreground font-brand"
					>
						Skriuw
					</motion.h1>
					<motion.div
						variants={itemVariants}
						className="flex flex-col items-center gap-1 text-muted-foreground"
					>
						<p className="text-sm italic">
							<span className="font-mono">/skrɪu̯/</span> —{' '}
							<span className="font-medium">Frisian, &quot;to write.&quot;</span>
						</p>
					</motion.div>
				</div>

				<motion.div variants={itemVariants} className="max-w-lg text-center">
					<p className="text-sm text-muted-foreground leading-relaxed">
						A blazingly fast, privacy-focused note-taking app built for everyone. Providing an
						opt-in system for all features (yes, AI is included) rather than the usual opt-out
						system. The tools are here, you just need to opt-in.
					</p>
				</motion.div>
			</div>

			<motion.div variants={itemVariants} className="flex flex-row items-center gap-4 mt-8">
				<Button
					variant="secondary"
					size="lg"
					onClick={onOpenCollection}
					className="flex items-center justify-between gap-3"
				>
					<span>Open Collection</span>
					<Kbd>⌘O</Kbd>
				</Button>
				<Button
					variant="default"
					size="lg"
					onClick={onCreateNote}
					className="flex items-center justify-between gap-3"
				>
					<span>Create Note</span>
					<Kbd className="bg-primary-foreground/20 text-primary-foreground">⌘N</Kbd>
				</Button>
			</motion.div>
		</motion.div>
	)
}
