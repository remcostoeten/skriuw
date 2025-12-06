'use client'

import { Download, Upload, HardDrive } from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

import { Tabs, TabsList, TabsTrigger } from '@skriuw/ui/tabs'
import { cn } from '@skriuw/core-logic'

import { ExportPanel } from '@/features/backup/components/export-panel'
import { ImportPanel } from '@/features/backup/components/import-panel'

const tabs = [
	{ value: 'export', label: 'Export', icon: Download },
	{ value: 'import', label: 'Import', icon: Upload },
] as const

export default function DataBackupPage() {
	const [activeTab, setActiveTab] = useState('export')

	useEffect(() => {
		const savedTab = localStorage.getItem('archive-active-tab')
		if (savedTab && ['export', 'import'].includes(savedTab)) {
			setActiveTab(savedTab)
		}
	}, [])

	function handleTabChange(value: string) {
		setActiveTab(value)
		localStorage.setItem('archive-active-tab', value)
	}

	return (
		<div className="flex flex-col h-full">
			<div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4">
				<h1 className="text-2xl font-semibold flex items-center gap-2">
					<HardDrive className="h-6 w-6" />
					Data & Backup
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Export your notes for backup, or import from other apps
				</p>
			</div>

			<div className="flex-1 overflow-hidden">
				<Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col px-0">
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
											isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
										)}
									>
										{/* Active underline indicator */}
										{isActive && (
											<motion.div
												layoutId="archive-tab-indicator"
												className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
												transition={{
													type: 'spring',
													stiffness: 500,
													damping: 35,
												}}
											/>
										)}

										<Icon className="h-4 w-4 relative z-10" />
										<span className="relative z-10">{tab.label}</span>
									</TabsTrigger>
								)
							})}
						</TabsList>
					</div>

					<div className="flex-1 overflow-y-auto p-6">
						<div className="max-w-lg mx-auto">
							{activeTab === 'export' && (
								<>
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Export Notes</h2>
										<p className="text-sm text-muted-foreground">
											Download a backup of all your notes and folders
										</p>
									</div>
									<ExportPanel />
								</>
							)}

							{activeTab === 'import' && (
								<>
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Import Notes</h2>
										<p className="text-sm text-muted-foreground">
											Restore from a backup or import from other apps
										</p>
									</div>
									<ImportPanel />
								</>
							)}
						</div>
					</div>
				</Tabs>
			</div>
		</div>
	)
}

