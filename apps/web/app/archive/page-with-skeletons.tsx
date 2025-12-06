'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { Tabs, TabsList, TabsTrigger } from '@skriuw/ui/tabs'

import {
	ArchivePageSkeleton,
	ExportPanelSkeleton,
	ImportPanelSkeleton,
	TrashPanelSkeleton,
} from './components'

// Mock actual components for demonstration
const MockExportPanel = () => <div className="p-4 border rounded-lg">Export Panel Content</div>
const MockImportPanel = () => <div className="p-4 border rounded-lg">Import Panel Content</div>
const MockTrashPanel = () => <div className="p-4 border rounded-lg">Trash Panel Content</div>

export default function DataBackupPageWithSkeletons() {
	const [activeTab, setActiveTab] = useState('export')
	const [isLoading, setIsLoading] = useState(true)

	// Simulate initial loading
	useEffect(() => {
		const timer = setTimeout(() => {
			setIsLoading(false)
		}, 2000) // 2 second loading delay for demo

		return () => clearTimeout(timer)
	}, [])

	// Simulate tab switching loading
	const [isTabLoading, setIsTabLoading] = useState(false)
	const handleTabChange = (value: string) => {
		setIsTabLoading(true)
		setActiveTab(value)
		localStorage.setItem('archive-active-tab', value)

		// Simulate loading delay when switching tabs
		setTimeout(() => {
			setIsTabLoading(false)
		}, 800)
	}

	// Show full page skeleton during initial load
	if (isLoading) {
		return <ArchivePageSkeleton />
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4">
				<h1 className="text-2xl font-semibold flex items-center gap-2">🗂️ Data & Backup</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Export your notes for backup, or import from other apps
				</p>
			</div>

			<div className="flex-1 overflow-hidden">
				<Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
					{/* Tab Navigation */}
					<div className="border-b border-border/69">
						<TabsList className="bg-transparent gap-1">
							<TabsTrigger value="export" className="flex items-center gap-2">
								📥 Export
							</TabsTrigger>
							<TabsTrigger value="import" className="flex items-center gap-2">
								📤 Import
							</TabsTrigger>
							<TabsTrigger value="trash" className="flex items-center gap-2">
								🗑️ Trash
							</TabsTrigger>
						</TabsList>
					</div>

					{/* Tab Content */}
					<div className="flex-1 overflow-y-auto">
						<AnimatePresence mode="wait">
							{activeTab === 'export' && (
								<motion.div
									key="export"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.2 }}
									className="m-0 p-6 h-full"
								>
									<div className="max-w-lg mx-auto">
										<div className="mb-6">
											<h2 className="text-xl font-semibold mb-2">Export Notes</h2>
											<p className="text-sm text-muted-foreground">
												Download a backup of all your notes and folders
											</p>
										</div>
										{isTabLoading ? <ExportPanelSkeleton /> : <MockExportPanel />}
									</div>
								</motion.div>
							)}

							{activeTab === 'import' && (
								<motion.div
									key="import"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.2 }}
									className="m-0 p-6 h-full"
								>
									<div className="max-w-lg mx-auto">
										<div className="mb-6">
											<h2 className="text-xl font-semibold mb-2">Import Notes</h2>
											<p className="text-sm text-muted-foreground">
												Restore from a backup or import from other apps
											</p>
										</div>
										{isTabLoading ? <ImportPanelSkeleton /> : <MockImportPanel />}
									</div>
								</motion.div>
							)}

							{activeTab === 'trash' && (
								<motion.div
									key="trash"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.2 }}
									className="m-0 p-6 h-full"
								>
									<div className="max-w-lg mx-auto">
										<div className="mb-6">
											<h2 className="text-xl font-semibold mb-2">Trash</h2>
											<p className="text-sm text-muted-foreground">
												Deleted items are kept here for 30 days
											</p>
										</div>
										{isTabLoading ? <TrashPanelSkeleton /> : <MockTrashPanel />}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</Tabs>
			</div>
		</div>
	)
}
