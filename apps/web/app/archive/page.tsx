'use client'

import { Download, Upload, HardDrive, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@skriuw/ui/tabs'

import { ExportPanel } from '@/features/backup/components/export-panel'
import { ImportPanel } from '@/features/backup/components/import-panel'
import { TrashPanel } from '@/features/backup/components/trash-panel'

export default function DataBackupPage() {
	const [activeTab, setActiveTab] = useState('export')

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
				<Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
					<div className="border-b border-border/70 px-6">
						<TabsList className="bg-transparent">
							<TabsTrigger value="export" className="flex items-center gap-2">
								<Download className="h-4 w-4" />
								Export
							</TabsTrigger>
							<TabsTrigger value="import" className="flex items-center gap-2">
								<Upload className="h-4 w-4" />
								Import
							</TabsTrigger>
							<TabsTrigger value="trash" className="flex items-center gap-2">
								<Trash2 className="h-4 w-4" />
								Trash
							</TabsTrigger>
						</TabsList>
					</div>

					<div className="flex-1 overflow-y-auto">
						<TabsContent value="export" className="m-0 p-6 h-full">
							<div className="max-w-lg mx-auto">
								<div className="mb-6">
									<h2 className="text-xl font-semibold mb-2">Export Notes</h2>
									<p className="text-sm text-muted-foreground">
										Download a backup of all your notes and folders
									</p>
								</div>
								<ExportPanel />
							</div>
						</TabsContent>

						<TabsContent value="import" className="m-0 p-6 h-full">
							<div className="max-w-lg mx-auto">
								<div className="mb-6">
									<h2 className="text-xl font-semibold mb-2">Import Notes</h2>
									<p className="text-sm text-muted-foreground">
										Restore from a backup or import from other apps
									</p>
								</div>
								<ImportPanel />
							</div>
						</TabsContent>

						<TabsContent value="trash" className="m-0 p-6 h-full">
							<div className="max-w-lg mx-auto">
								<div className="mb-6">
									<h2 className="text-xl font-semibold mb-2">Trash</h2>
									<p className="text-sm text-muted-foreground">
										Deleted items are kept here for 30 days
									</p>
								</div>
								<TrashPanel />
							</div>
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	)
}
