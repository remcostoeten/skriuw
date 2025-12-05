'use client'

import { useState } from 'react'
import { Download, FileJson, FileText, Check, Loader2 } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { cn } from '@skriuw/core-logic'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { downloadJsonExport, downloadMarkdownExport, type ExportFormat } from '../utils/export-notes'

type ExportOption = {
	id: ExportFormat
	title: string
	description: string
	icon: React.ReactNode
	fileType: string
}

const exportOptions: ExportOption[] = [
	{
		id: 'json',
		title: 'Skriuw Backup',
		description: 'Full backup with all data. Best for restoring later.',
		icon: <FileJson className="h-5 w-5" />,
		fileType: '.json',
	},
	{
		id: 'markdown',
		title: 'Markdown Export',
		description: 'Portable markdown files. Works with Obsidian, Notion, etc.',
		icon: <FileText className="h-5 w-5" />,
		fileType: '.md',
	},
]

export function ExportPanel() {
	const { items, isInitialLoading } = useNotesContext()
	const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
	const [isExporting, setIsExporting] = useState(false)
	const [exportSuccess, setExportSuccess] = useState(false)

	// Count items
	const countItems = (itemList: typeof items): { notes: number; folders: number } => {
		let notes = 0
		let folders = 0
		for (const item of itemList) {
			if (item.type === 'note') {
				notes++
			} else {
				folders++
				const childCounts = countItems(item.children)
				notes += childCounts.notes
				folders += childCounts.folders
			}
		}
		return { notes, folders }
	}

	const { notes: noteCount, folders: folderCount } = countItems(items)
	const hasContent = noteCount > 0 || folderCount > 0

	const handleExport = async () => {
		if (!hasContent) return

		setIsExporting(true)
		setExportSuccess(false)

		try {
			// Small delay for UX
			await new Promise(resolve => setTimeout(resolve, 300))

			if (selectedFormat === 'json') {
				downloadJsonExport(items, { includeMetadata: true })
			} else {
				downloadMarkdownExport(items)
			}

			setExportSuccess(true)
			setTimeout(() => setExportSuccess(false), 3000)
		} catch (error) {
			console.error('Export failed:', error)
		} finally {
			setIsExporting(false)
		}
	}

	if (isInitialLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* Stats */}
			<div className="flex gap-4">
				<div className="flex-1 rounded-lg border border-border bg-muted/30 p-4">
					<div className="text-2xl font-bold">{noteCount}</div>
					<div className="text-sm text-muted-foreground">Notes</div>
				</div>
				<div className="flex-1 rounded-lg border border-border bg-muted/30 p-4">
					<div className="text-2xl font-bold">{folderCount}</div>
					<div className="text-sm text-muted-foreground">Folders</div>
				</div>
			</div>

			{/* Format Selection */}
			<div className="space-y-3">
				<h3 className="text-sm font-medium text-muted-foreground">Export Format</h3>
				<div className="grid gap-3">
					{exportOptions.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => setSelectedFormat(option.id)}
							className={cn(
								'flex items-start gap-4 rounded-lg border p-4 text-left transition-all',
								'hover:bg-muted/50',
								selectedFormat === option.id
									? 'border-primary bg-primary/5'
									: 'border-border'
							)}
						>
							<div className={cn(
								'rounded-md p-2',
								selectedFormat === option.id
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground'
							)}>
								{option.icon}
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<span className="font-medium">{option.title}</span>
									<span className="text-xs text-muted-foreground">
										{option.fileType}
									</span>
								</div>
								<p className="text-sm text-muted-foreground mt-0.5">
									{option.description}
								</p>
							</div>
							{selectedFormat === option.id && (
								<Check className="h-5 w-5 text-primary" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* Export Button */}
			<Button
				onClick={handleExport}
				disabled={!hasContent || isExporting}
				className="w-full"
				size="lg"
			>
				{isExporting ? (
					<>
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						Exporting...
					</>
				) : exportSuccess ? (
					<>
						<Check className="h-4 w-4 mr-2" />
						Downloaded!
					</>
				) : (
					<>
						<Download className="h-4 w-4 mr-2" />
						Export {noteCount} Notes
					</>
				)}
			</Button>

			{!hasContent && (
				<p className="text-sm text-muted-foreground text-center">
					No notes to export. Create some notes first!
				</p>
			)}
		</div>
	)
}
