'use client'

import { Download, Upload, HardDrive, Cloud } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { Tabs, TabsList, TabsTrigger } from '@skriuw/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { cn } from '@skriuw/shared'

import { ExportPanel } from '@/features/backup/components/export-panel'
import { ImportPanel } from '@/features/backup/components/import-panel'
import { StorageAdaptersPanel } from '@/features/backup/components/storage-adapters-panel'
import { useStorageConnectors } from '@/features/backup/hooks/use-storage-connectors'
import { usePrefersAnimations } from '@/hooks/use-prefers-animations'
import type { StorageConnectorType } from '@/features/backup/core/types'

const tabs = [
	{ value: 'export', label: 'Export', icon: Download },
	{ value: 'import', label: 'Import', icon: Upload },
	{ value: 'storage', label: 'Storage', icon: Cloud },
] as const

// Animation constants (copied from StorageAdaptersPanel for consistency)
const snappyEase = [0.34, 1.8, 0.64, 1]
const smoothEase = [0.22, 1, 0.36, 1]

const contentVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 50,
		scale: 0.96,
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.25,
			ease: snappyEase as any,
			delay: 0.05,
		},
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -40,
		scale: 0.98,
		transition: {
			duration: 0.15,
			ease: smoothEase as any,
		},
	}),
}

const headerVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 40,
		scale: 0.95,
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.22,
			ease: snappyEase as any,
			delay: 0,
		},
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -35,
		scale: 0.97,
		transition: {
			duration: 0.12,
			ease: smoothEase as any,
			delay: 0.04,
		},
	}),
}

export default function DataBackupPage() {
	const [activeTab, setActiveTab] = useState('export')
	const [tabDirection, setTabDirection] = useState(1)
	const [storageProvider, setStorageProvider] = useState<StorageConnectorType>('s3')
	const [providerDirection, setProviderDirection] = useState(1)
	const { definitions, connectors } = useStorageConnectors()
	const prefersAnimations = usePrefersAnimations(true)
	const lastProviderRef = useRef<StorageConnectorType>('s3')
	const connectorTypes = useMemo(() => definitions.map((d) => d.type), [definitions])
	const [hasInteracted, setHasInteracted] = useState(false)

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

	function handleTabChange(value: string) {
		const tabOrder = ['export', 'import', 'storage']
		const currentIndex = tabOrder.indexOf(activeTab)
		const nextIndex = tabOrder.indexOf(value)
		if (currentIndex !== -1 && nextIndex !== -1) {
			setTabDirection(nextIndex > currentIndex ? 1 : -1)
		}
		setActiveTab(value)
		localStorage.setItem('archive-active-tab', value)
		setHasInteracted(true) // Enable animations after first user interaction
	}

	function handleStorageProviderChange(next: StorageConnectorType) {
		const currentIndex = definitions.findIndex((d) => d.type === storageProvider)
		const nextIndex = definitions.findIndex((d) => d.type === next)
		if (currentIndex !== -1 && nextIndex !== -1) {
			setProviderDirection(nextIndex > currentIndex ? 1 : -1)
		}
		setStorageProvider(next)
		lastProviderRef.current = next
		localStorage.setItem('archive-storage-provider', next)
	}

	return (
		<div className="flex flex-col h-full">
			<div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4">
				<h1 className="text-2xl font-semibold flex items-center gap-2">
					<HardDrive className="h-6 w-6" />
					Data & Backup
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Safely backup your notes, migrate between devices, or import from other note-taking apps
				</p>
			</div>

			<div className="flex-1 overflow-hidden">
				<Tabs
					value={activeTab}
					onValueChange={handleTabChange}
					className="h-full flex flex-col px-0"
				>
					<div className="border-b border-border/50 ">
						<TabsList className="bg-transparent gap-0 h-11">
							{tabs.map((tab) => {
								const Icon = tab.icon
								const isActive = activeTab === tab.value

								return (
									<TabsTrigger
										key={tab.value}
										value={tab.value}
										className={cn(
											'relative flex items-center gap-2 px-4 py-2 text-sm font-medium',
											'transition-colors duration-150',
											'data-[state=active]:bg-transparent data-[state=active]:shadow-none',
											isActive
												? 'text-foreground'
												: 'text-muted-foreground hover:text-foreground/80'
										)}
									>
										<div className="relative flex items-center gap-2">
											<Icon className="h-4 w-4 relative z-10" />
											<span className="relative z-10">{tab.label}</span>
											{isActive && (
												<div className="absolute inset-x-0 -bottom-2 h-px bg-primary/80 rounded-full" />
											)}
										</div>
									</TabsTrigger>
								)
							})}
						</TabsList>
					</div>

					<div className="flex-1 overflow-y-auto p-6">
						<div className="max-w-5xl mx-auto w-full">
							<AnimatePresence mode="wait" initial={false}>
								{activeTab === 'export' && (
									<Card key="export" className="border-border/70 shadow-sm w-full overflow-hidden">
										<CardHeader>
											<motion.div
												variants={headerVariants}
												initial={hasInteracted ? 'initial' : false}
												animate="animate"
												exit={hasInteracted ? 'exit' : undefined}
												custom={tabDirection}
												className="space-y-1.5"
											>
												<CardTitle className="flex items-center gap-2">Export Notes</CardTitle>
												<CardDescription>
													Create a backup of all your notes and folders to keep them safe
												</CardDescription>
											</motion.div>
										</CardHeader>
										<CardContent>
											<motion.div
												variants={contentVariants}
												initial={hasInteracted ? 'initial' : false}
												animate="animate"
												exit={hasInteracted ? 'exit' : undefined}
												custom={tabDirection}
												className="space-y-6"
											>
												<div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
													<p>
														<strong>Export as JSON:</strong> Complete backup with all formatting
													</p>
													<p>
														<strong>Export as Markdown:</strong> Plain text files, great for reading
														anywhere
													</p>
													<p>
														<strong>When to export:</strong> Before switching devices or after
														important changes
													</p>
												</div>
												<ExportPanel />
											</motion.div>
										</CardContent>
									</Card>
								)}

								{activeTab === 'import' && (
									<Card key="import" className="border-border/70 shadow-sm w-full overflow-hidden">
										<CardHeader>
											<motion.div
												variants={headerVariants}
												initial={hasInteracted ? 'initial' : false}
												animate="animate"
												exit={hasInteracted ? 'exit' : undefined}
												custom={tabDirection}
												className="space-y-1.5"
											>
												<CardTitle className="flex items-center gap-2">Import Notes</CardTitle>
												<CardDescription>
													Restore from a backup or bring notes from other apps
												</CardDescription>
											</motion.div>
										</CardHeader>
										<CardContent>
											<motion.div
												variants={contentVariants}
												initial={hasInteracted ? 'initial' : false}
												animate="animate"
												exit={hasInteracted ? 'exit' : undefined}
												custom={tabDirection}
												className="space-y-6"
											>
												<div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
													<p>
														<strong>Import JSON:</strong> Restore a previous backup from this app
													</p>
													<p>
														<strong>Import Markdown:</strong> Bring in notes from other apps or text
														files
													</p>
													<p>
														<strong>Non-destructive:</strong> Importing creates new notes and won't
														overwrite existing ones
													</p>
												</div>
												<ImportPanel />
											</motion.div>
										</CardContent>
									</Card>
								)}

								{activeTab === 'storage' && (
									<Card key="storage" className="border-border/70 shadow-sm w-full overflow-hidden">
										<CardHeader>
											<motion.div
												variants={headerVariants}
												initial={hasInteracted ? 'initial' : false}
												animate="animate"
												exit={hasInteracted ? 'exit' : undefined}
												custom={tabDirection}
												className="space-y-1.5"
											>
												<CardTitle className="flex items-center gap-2">
													Cloud storage adapters
												</CardTitle>
												<CardDescription>
													One place for credentials: Manage S3, Dropbox, or Google Drive
												</CardDescription>
											</motion.div>
										</CardHeader>
										<CardContent>
											<motion.div
												variants={contentVariants}
												initial={hasInteracted ? 'initial' : false}
												animate="animate"
												exit={hasInteracted ? 'exit' : undefined}
												custom={tabDirection}
												className="space-y-6"
											>
												<div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
													<p>
														<strong>Validate before use:</strong> Each connector runs a quick check
													</p>
												</div>

												<div className="mb-4">
													<div className="text-sm text-muted-foreground mb-2">
														Choose a provider to configure.
													</div>
													<div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
														{definitions.map((definition) => {
															const connector = connectors.find((c) => c.type === definition.type)
															const isActive = storageProvider === definition.type
															return (
																<button
																	key={definition.type}
																	type="button"
																	onClick={() => handleStorageProviderChange(definition.type)}
																	className={cn(
																		'flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md border',
																		'transition-colors',
																		isActive
																			? 'border-primary/60 bg-primary/10 text-foreground'
																			: 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/60'
																	)}
																>
																	<span className="flex items-center gap-2">
																		<Cloud className="h-4 w-4" />
																		{definition.label}
																	</span>
																	<span className="text-xs text-muted-foreground">
																		{connector?.status === 'connected'
																			? 'Connected'
																			: connector?.status === 'error'
																				? 'Needs attention'
																				: 'Not connected'}
																	</span>
																</button>
															)
														})}
													</div>
												</div>

												<div className="relative">
													<StorageAdaptersPanel
														activeType={storageProvider}
														onTypeChange={(val) => handleStorageProviderChange(val)}
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
				</Tabs>
			</div>
		</div>
	)
}
