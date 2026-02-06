'use client'

import { TrashPanel } from '@/features/backup/components/trash-panel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'

const snappyEase = [0.34, 1.8, 0.64, 1]

const contentVariants = {
	initial: {
		opacity: 0,
		y: 20,
		scale: 0.96
	},
	animate: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: {
			duration: 0.25,
			ease: snappyEase as any,
			delay: 0.05
		}
	}
}

export default function TrashPage() {
	return (
		<div className='flex flex-col h-full'>
			<div className='border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4'>
				<h1 className='text-2xl font-semibold flex items-center gap-2'>
					<Trash2 className='h-6 w-6' />
					Trash
				</h1>
				<p className='text-sm text-muted-foreground mt-1'>
					Deleted items are kept here for 30 days before being permanently removed
				</p>
			</div>

			<div className='flex-1 overflow-y-auto p-6'>
				<div className='max-w-5xl mx-auto w-full'>
					<motion.div variants={contentVariants} initial='initial' animate='animate'>
						<Card className='border-border/70 shadow-sm w-full overflow-hidden'>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									Deleted Items
								</CardTitle>
								<CardDescription>
									Manage your deleted notes and folders. You can restore them or
									delete them forever.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<TrashPanel />
							</CardContent>
						</Card>
					</motion.div>
				</div>
			</div>
		</div>
	)
}
