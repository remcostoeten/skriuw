'use client'

import { ExportPanel } from '@/features/backup/components/export-panel'
import { ImportPanel } from '@/features/backup/components/import-panel'
import { StorageAdaptersPanel } from '@/features/backup/components/storage-adapters-panel'
import type { StorageConnectorType } from '@/features/backup/core/types'
import { useStorageConnectors } from '@/features/backup/hooks/use-storage-connectors'
import { cn } from '@skriuw/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@skriuw/ui/tabs'
import { motion, AnimatePresence, useMotionValue, PanInfo } from 'framer-motion'
import { Download, Upload, HardDrive, Cloud, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

const tabs = [
	{ value: 'export', label: 'Export', icon: Download },
	{ value: 'import', label: 'Import', icon: Upload },
	{ value: 'storage', label: 'Storage', icon: Cloud }
] as const

const snappyEase = [0.34, 1.8, 0.64, 1]
const smoothEase = [0.22, 1, 0.36, 1]

const contentVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 50,
		scale: 0.96
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.25,
			ease: snappyEase as any,
			delay: 0.05
		}
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -40,
		scale: 0.98,
		transition: {
			duration: 0.15,
			ease: smoothEase as any
		}
	})
}

const headerVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 40,
		scale: 0.95
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.22,
			ease: snappyEase as any,
			delay: 0
		}
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -35,
		scale: 0.97,
		transition: {
			duration: 0.12,
			ease: smoothEase as any,
			delay: 0.04
		}
	})
}

export default function DataBackupPage() {
	const [activeTab, setActiveTab] = useState('export')
	const [tabDirection, setTabDirection] = useState(1)
	const [storageProvider, setStorageProvider] = useState<StorageConnectorType>('s3')
	const [providerDirection, setProviderDirection] = useState(1)
	const { definitions, connectors } = useStorageConnectors()
	const lastProviderRef = useRef<StorageConnectorType>('s3')
	const connectorTypes = useMemo(() => definitions.map((d) => d.type), [definitions])
	const [hasInteracted, setHasInteracted] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	const dragX = useMotionValue(0)

	useEffect(() => {
		const savedTab = localStorage.getItem('archive-active-tab')
		if (savedTab && ['export', 'import', 'storage'].includes(savedTab)) {
			setActiveTab(savedTab)
		}
		const savedProvider = localStorage.getItem('archive-storage-provider')
		if (savedProvider) {
			const typedProvider = savedProvider as StorageConnectorType
			if (connectorTypes.includes(typedProvider)) {
				setStorageProvider(typedProvider)
				lastProviderRef.current = typedProvider
			}
		}
	}, [connectorTypes])

	const handleTabChange = useCallback(
		(value: string) => {
			const tabOrder = ['export', 'import', 'storage']
			const currentIndex = tabOrder.indexOf(activeTab)
			const nextIndex = tabOrder.indexOf(value)
			if (currentIndex !== -1 && nextIndex !== -1) {
				setTabDirection(nextIndex > currentIndex ? 1 : -1)
			}
			setActiveTab(value)
			localStorage.setItem('archive-active-tab', value)
			setHasInteracted(true)
		},
		[activeTab]
	)

	const handleStorageProviderChange = useCallback(
		(next: StorageConnectorType) => {
			const currentIndex = definitions.findIndex((d) => d.type === storageProvider)
			const nextIndex = definitions.findIndex((d) => d.type === next)
			if (currentIndex !== -1 && nextIndex !== -1) {
				setProviderDirection(nextIndex > currentIndex ? 1 : -1)
			}
			setStorageProvider(next)
			lastProviderRef.current = next
			localStorage.setItem('archive-storage-provider', next)
		},
		[definitions, storageProvider]
	)

	const navigateTab = useCallback(
		(direction: 'prev' | 'next') => {
			const tabOrder = ['export', 'import', 'storage']
			const currentIndex = tabOrder.indexOf(activeTab)

			if (direction === 'next' && currentIndex < tabOrder.length - 1) {
				handleTabChange(tabOrder[currentIndex + 1])
			} else if (direction === 'prev' && currentIndex > 0) {
				handleTabChange(tabOrder[currentIndex - 1])
			}
		},
		[activeTab, handleTabChange]
	)

	const handleDragStart = useCallback(() => {
		setIsDragging(true)
	}, [])

	const handleDragEnd = useCallback(
		(_: any, info: PanInfo) => {
			setIsDragging(false)
			const swipeThreshold = 60
			const velocityThreshold = 300

			const offset = info.offset.x
			const velocity = info.velocity.x

			if (offset < -swipeThreshold || velocity < -velocityThreshold) {
				navigateTab('next')
			} else if (offset > swipeThreshold || velocity > velocityThreshold) {
				navigateTab('prev')
			}

			dragX.set(0)
		},
		[navigateTab, dragX]
	)

	const currentTabIndex = tabs.findIndex((t) => t.value === activeTab)
	const canGoLeft = currentTabIndex > 0
	const canGoRight = currentTabIndex < tabs.length - 1

	return (
		<div className='flex flex-col h-full overflow-hidden'>
			<div className='shrink-0 border-b border-border/70 bg-muted/40 backdrop-blur-sm px-4 md:px-6 py-3 md:py-4'>
				<h1 className='text-lg md:text-2xl font-semibold flex items-center gap-2'>
					<HardDrive className='h-5 w-5 md:h-6 md:w-6 shrink-0' />
					<span className='truncate'>Data & Backup</span>
				</h1>
				<p className='text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2 md:line-clamp-1'>
					Backup your notes, migrate between devices, or import from other apps
				</p>
			</div>

			<div className='flex-1 flex flex-col overflow-hidden'>
				<Tabs
					value={activeTab}
					onValueChange={handleTabChange}
					className='h-full flex flex-col'
				>
					<div className='shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10'>
						<div className='flex items-center'>
							<button
								type='button'
								onClick={() => navigateTab('prev')}
								disabled={!canGoLeft}
								className={cn(
									'p-2 md:hidden transition-opacity touch-manipulation',
									canGoLeft ? 'opacity-100' : 'opacity-30 pointer-events-none'
								)}
								aria-label='Previous tab'
							>
								<ChevronLeft className='h-5 w-5' />
							</button>

							<TabsList className='bg-transparent gap-0 h-12 md:h-11 flex-1 justify-center md:justify-start'>
								{tabs.map((tab) => {
									const Icon = tab.icon
									const isActive = activeTab === tab.value

									return (
										<TabsTrigger
											key={tab.value}
											value={tab.value}
											className={cn(
												'relative flex items-center gap-1.5 md:gap-2 px-4 md:px-4 py-2.5 md:py-2 text-sm font-medium',
												'transition-all duration-150',
												'data-[state=active]:bg-transparent data-[state=active]:shadow-none',
												'touch-manipulation active:scale-95 md:active:scale-100',
												isActive
													? 'text-foreground'
													: 'text-muted-foreground hover:text-foreground/80'
											)}
										>
											<div className='relative flex items-center gap-1.5 md:gap-2'>
												<Icon
													className={cn(
														'h-4 w-4 transition-transform',
														isActive && 'scale-110'
													)}
												/>
												<span className='hidden sm:inline'>
													{tab.label}
												</span>
												{isActive && (
													<motion.div
														layoutId='activeTabIndicator'
														className='absolute inset-x-0 -bottom-2.5 md:-bottom-2 h-0.5 bg-primary rounded-full'
														transition={{
															type: 'spring',
															stiffness: 500,
															damping: 30
														}}
													/>
												)}
											</div>
										</TabsTrigger>
									)
								})}
							</TabsList>

							<button
								type='button'
								onClick={() => navigateTab('next')}
								disabled={!canGoRight}
								className={cn(
									'p-2 md:hidden transition-opacity touch-manipulation',
									canGoRight ? 'opacity-100' : 'opacity-30 pointer-events-none'
								)}
								aria-label='Next tab'
							>
								<ChevronRight className='h-5 w-5' />
							</button>
						</div>

						<div className='flex justify-center gap-2 pb-2 md:hidden'>
							{tabs.map((tab) => (
								<button
									key={tab.value}
									type='button'
									onClick={() => handleTabChange(tab.value)}
									className={cn(
										'h-2 rounded-full transition-all duration-300 touch-manipulation',
										activeTab === tab.value
											? 'w-8 bg-primary'
											: 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
									)}
									aria-label={`Go to ${tab.label}`}
								/>
							))}
						</div>
					</div>

					<motion.div
						className='flex-1 overflow-y-auto overflow-x-hidden touch-pan-y'
						drag='x'
						dragConstraints={{ left: 0, right: 0 }}
						dragElastic={{
							left: canGoRight ? 0.15 : 0.05,
							right: canGoLeft ? 0.15 : 0.05
						}}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						dragDirectionLock
						style={{
							x: dragX,
							touchAction: 'pan-y pinch-zoom'
						}}
						whileDrag={{ cursor: 'grabbing' }}
					>
						<div
							className={cn(
								'p-3 md:p-6 min-h-full transition-opacity',
								isDragging && 'opacity-90'
							)}
						>
							<div className='max-w-5xl mx-auto w-full'>
								<AnimatePresence mode='wait' initial={false}>
									{activeTab === 'export' && (
										<Card
											key='export'
											className='border-border/70 shadow-sm w-full overflow-hidden'
										>
											<CardHeader className='pb-3 md:pb-6 px-4 md:px-6'>
												<motion.div
													variants={headerVariants}
													initial={hasInteracted ? 'initial' : false}
													animate='animate'
													exit={hasInteracted ? 'exit' : undefined}
													custom={tabDirection}
													className='space-y-1'
												>
													<CardTitle className='flex items-center gap-2 text-base md:text-lg'>
														<Download className='h-4 w-4 md:hidden' />
														Export Notes
													</CardTitle>
													<CardDescription className='text-xs md:text-sm'>
														Create a backup of all your notes and
														folders
													</CardDescription>
												</motion.div>
											</CardHeader>
											<CardContent className='px-4 md:px-6 pb-6'>
												<motion.div
													variants={contentVariants}
													initial={hasInteracted ? 'initial' : false}
													animate='animate'
													exit={hasInteracted ? 'exit' : undefined}
													custom={tabDirection}
													className='space-y-4 md:space-y-6'
												>
													<div className='rounded-lg border border-border/60 bg-muted/40 p-3 text-xs md:text-sm text-muted-foreground space-y-2'>
														<p className='flex items-start gap-2'>
															<span className='font-semibold text-foreground shrink-0'>
																JSON:
															</span>
															<span>
																Complete backup with formatting
															</span>
														</p>
														<p className='flex items-start gap-2'>
															<span className='font-semibold text-foreground shrink-0'>
																Markdown:
															</span>
															<span>Plain text, works anywhere</span>
														</p>
													</div>
													<ExportPanel />
												</motion.div>
											</CardContent>
										</Card>
									)}

									{activeTab === 'import' && (
										<Card
											key='import'
											className='border-border/70 shadow-sm w-full overflow-hidden'
										>
											<CardHeader className='pb-3 md:pb-6 px-4 md:px-6'>
												<motion.div
													variants={headerVariants}
													initial={hasInteracted ? 'initial' : false}
													animate='animate'
													exit={hasInteracted ? 'exit' : undefined}
													custom={tabDirection}
													className='space-y-1'
												>
													<CardTitle className='flex items-center gap-2 text-base md:text-lg'>
														<Upload className='h-4 w-4 md:hidden' />
														Import Notes
													</CardTitle>
													<CardDescription className='text-xs md:text-sm'>
														Restore from backup or import from other
														apps
													</CardDescription>
												</motion.div>
											</CardHeader>
											<CardContent className='px-4 md:px-6 pb-6'>
												<motion.div
													variants={contentVariants}
													initial={hasInteracted ? 'initial' : false}
													animate='animate'
													exit={hasInteracted ? 'exit' : undefined}
													custom={tabDirection}
													className='space-y-4 md:space-y-6'
												>
													<div className='rounded-lg border border-border/60 bg-muted/40 p-3 text-xs md:text-sm text-muted-foreground space-y-2'>
														<p className='flex items-start gap-2'>
															<span className='font-semibold text-foreground shrink-0'>
																JSON:
															</span>
															<span>Restore previous backup</span>
														</p>
														<p className='flex items-start gap-2'>
															<span className='font-semibold text-foreground shrink-0'>
																Markdown:
															</span>
															<span>Import from other apps</span>
														</p>
														<p className='text-[10px] md:text-xs text-muted-foreground/70 pt-1 border-t border-border/40'>
															Non-destructive: won't overwrite
															existing notes
														</p>
													</div>
													<ImportPanel />
												</motion.div>
											</CardContent>
										</Card>
									)}

									{activeTab === 'storage' && (
										<Card
											key='storage'
											className='border-border/70 shadow-sm w-full overflow-hidden'
										>
											<CardHeader className='pb-3 md:pb-6 px-4 md:px-6'>
												<motion.div
													variants={headerVariants}
													initial={hasInteracted ? 'initial' : false}
													animate='animate'
													exit={hasInteracted ? 'exit' : undefined}
													custom={tabDirection}
													className='space-y-1'
												>
													<CardTitle className='flex items-center gap-2 text-base md:text-lg'>
														<Cloud className='h-4 w-4 md:hidden' />
														Cloud Storage
													</CardTitle>
													<CardDescription className='text-xs md:text-sm'>
														Connect S3, Dropbox, or Google Drive
													</CardDescription>
												</motion.div>
											</CardHeader>
											<CardContent className='px-4 md:px-6 pb-6'>
												<motion.div
													variants={contentVariants}
													initial={hasInteracted ? 'initial' : false}
													animate='animate'
													exit={hasInteracted ? 'exit' : undefined}
													custom={tabDirection}
													className='space-y-4 md:space-y-6'
												>
													<div className='grid grid-cols-1 gap-2'>
														{definitions.map((definition) => {
															const connector = connectors.find(
																(c) => c.type === definition.type
															)
															const isActive =
																storageProvider === definition.type
															const statusColor =
																connector?.status === 'connected'
																	? 'bg-green-500'
																	: connector?.status === 'error'
																		? 'bg-red-500'
																		: 'bg-muted-foreground/30'

															return (
																<button
																	key={definition.type}
																	type='button'
																	onClick={() =>
																		handleStorageProviderChange(
																			definition.type
																		)
																	}
																	className={cn(
																		'flex items-center justify-between gap-3 p-3 md:p-3 rounded-lg border',
																		'transition-all duration-200 touch-manipulation',
																		'active:scale-[0.98]',
																		isActive
																			? 'border-primary bg-primary/5 ring-1 ring-primary/20'
																			: 'border-border bg-muted/30 hover:bg-muted/50'
																	)}
																>
																	<div className='flex items-center gap-3'>
																		<div
																			className={cn(
																				'p-2 rounded-md',
																				isActive
																					? 'bg-primary/10'
																					: 'bg-muted'
																			)}
																		>
																			<Cloud className='h-4 w-4' />
																		</div>
																		<div className='text-left'>
																			<div className='font-medium text-sm'>
																				{definition.label}
																			</div>
																			<div className='text-xs text-muted-foreground'>
																				{connector?.status ===
																				'connected'
																					? 'Connected'
																					: connector?.status ===
																						  'error'
																						? 'Needs attention'
																						: 'Not configured'}
																			</div>
																		</div>
																	</div>
																	<div className='flex items-center gap-2'>
																		<div
																			className={cn(
																				'h-2 w-2 rounded-full',
																				statusColor
																			)}
																		/>
																		{isActive && (
																			<ChevronRight className='h-4 w-4 text-muted-foreground' />
																		)}
																	</div>
																</button>
															)
														})}
													</div>

													<div className='relative pt-2 border-t border-border/50'>
														<StorageAdaptersPanel
															activeType={storageProvider}
															onTypeChange={
																handleStorageProviderChange
															}
															showHeader={false}
															showTabs={false}
															direction={providerDirection}
														/>
													</div>
												</motion.div>
											</CardContent>
										</Card>
									)}
								</AnimatePresence>
							</div>
						</div>
					</motion.div>
				</Tabs>
			</div>
		</div>
	)
}
