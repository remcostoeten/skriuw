'use client'

import { Download, Upload, HardDrive, Cloud } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'

import { Tabs, TabsList, TabsTrigger } from '@skriuw/ui/tabs'
import { cn } from '@skriuw/shared'

import { ExportPanel } from '@/features/backup/components/export-panel'
import { ImportPanel } from '@/features/backup/components/import-panel'
import { StorageAdaptersPanel } from '@/features/backup/components/storage-adapters-panel'
import { useStorageConnectors } from '@/features/backup/hooks/use-storage-connectors'
import { usePrefersAnimations } from '@/features/backup/hooks/use-prefers-animations'
import type { StorageConnectorType } from '@/features/backup/core/types'

const tabs = [
	{ value: 'export', label: 'Export', icon: Download },
	{ value: 'import', label: 'Import', icon: Upload },
	{ value: 'storage', label: 'Storage', icon: Cloud },
] as const

export default function DataBackupPage() {
	const [activeTab, setActiveTab] = useState('export')
	const [storageProvider, setStorageProvider] = useState<StorageConnectorType>('s3')
	const [providerDirection, setProviderDirection] = useState(1)
	const { definitions, connectors } = useStorageConnectors()
	const prefersAnimations = usePrefersAnimations(true)
	const lastProviderRef = useRef<StorageConnectorType>('s3')
	const connectorTypes = useMemo(() => definitions.map((d) => d.type), [definitions])

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
		setActiveTab(value)
		localStorage.setItem('archive-active-tab', value)
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
				<div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
					<p className="text-xs text-blue-800 dark:text-blue-200">
						<strong>Why use this?</strong> Create regular backups to prevent data loss, easily
						move your notes to a new device, or switch from other apps like Notion, Evernote, or
						Apple Notes.
					</p>
				</div>
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
						<div className={cn(activeTab === 'storage' ? 'max-w-5xl' : 'max-w-lg', 'mx-auto')}>
							{activeTab === 'export' && (
								<>
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Export Notes</h2>
										<p className="text-sm text-muted-foreground mb-3">
											Create a backup of all your notes and folders to keep them safe
										</p>
										<div className="space-y-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
											<p>
												<strong>Export as JSON:</strong> Complete backup with all formatting,
												perfect for restoring to this app
											</p>
											<p>
												<strong>Export as Markdown:</strong> Plain text files, great for reading
												in any text editor or importing to other apps
											</p>
											<p>
												<strong>When to export:</strong> Before switching devices, after
												important changes, or monthly for peace of mind
											</p>
											<details
												className="mt-3 rounded-md border border-border/60 bg-background/70 px-3 py-2 transition-[background-color,border-color] duration-200"
											>
												<summary className="text-[13px] font-medium cursor-pointer list-none flex items-center justify-between gap-3 group px-1">
													<span className="flex items-center gap-2">
														<span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/80 text-[10px] leading-none transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180">
															<span className="-translate-y-px">⌄</span>
														</span>
														<span>What do these formats mean?</span>
													</span>
													<span className="text-muted-foreground text-xs sm:hidden">Tap to toggle</span>
												</summary>
												<div
													className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.33,1,0.68,1)] data-[open=false]:opacity-0 data-[open=false]:grid-rows-[0fr] data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100"
													data-open
												>
													<div className="min-h-0">
														<div className="mt-2 space-y-2 text-[13px] leading-relaxed">
															<p>
																<strong>Markdown (.md):</strong> Human-friendly plain text with lightweight
																formatting (headings, bold, lists). It is the same syntax used in the editor, so
																files stay readable in any text editor and work in tools like Obsidian or Notion.
															</p>
															<p>
																<strong>JSON (.json):</strong> A structured file format that computers read easily.
																Choose this when you want the safest full-fidelity restore of your notes and their
																metadata.
															</p>
															<p className="text-muted-foreground">
																Looking for plain .txt? Markdown is effectively plain text—just save or copy the
																exported Markdown without the extra symbols, and you get simple text while keeping
																compatibility with the editor.
															</p>
														</div>
													</div>
												</div>
											</details>
										</div>
									</div>
									<ExportPanel />
								</>
							)}

							{activeTab === 'import' && (
								<>
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Import Notes</h2>
										<p className="text-sm text-muted-foreground mb-3">
											Restore from a backup or bring notes from other apps
										</p>
										<div className="space-y-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
											<p>
												<strong>Import JSON:</strong> Restore a previous backup from this app
												(includes all formatting)
											</p>
											<p>
												<strong>Import Markdown:</strong> Bring in notes from other apps like
												Notion, Bear, or plain text files
											</p>
											<p>
												<strong>Important:</strong> Importing creates new notes - it won't
												overwrite your existing content
											</p>
										</div>
									</div>
									<ImportPanel />
								</>
							)}

							{activeTab === 'storage' && (
								<>
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
										{prefersAnimations ? (
											<motion.div
												key={storageProvider}
												initial={{ x: providerDirection * 40, opacity: 0 }}
												animate={{ x: 0, opacity: 1 }}
												transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
											>
												<StorageAdaptersPanel
													activeType={storageProvider}
													onTypeChange={(val) => handleStorageProviderChange(val as StorageConnectorType)}
													showHeader={false}
													showTabs={false}
												/>
											</motion.div>
										) : (
											<StorageAdaptersPanel
												activeType={storageProvider}
												onTypeChange={(val) => handleStorageProviderChange(val as StorageConnectorType)}
												showHeader={false}
												showTabs={false}
											/>
										)}
									</div>
								</>
							)}
						</div>
					</div>
				</Tabs>
			</div>
		</div>
	)
}
