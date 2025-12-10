'use client'

import { Download, FileJson, FileText, Check, Loader2 } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { cn } from '@skriuw/shared'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { downloadJsonExport, downloadMarkdownExport, type ExportFormat } from '../utils/export-notes'
import { FormatOptionCard, StatCard } from './shared/import-export-ui'
import { useState } from 'react'

type TExportOption = {
	id: ExportFormat
	title: string
	description: string
	icon: React.ReactNode
	fileType: string
}

const exportOptions: TExportOption[] = [
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

function countItems(itemList: any[]): { notes: number; folders: number } {
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

export function ExportPanel() {
	const { items, isInitialLoading } = useNotesContext()
	const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
	const [isExporting, setIsExporting] = useState(false)
	const [exportSuccess, setExportSuccess] = useState(false)

	const { notes: noteCount, folders: folderCount } = countItems(items)
	const hasContent = noteCount > 0 || folderCount > 0

	async function handleExport() {
		if (!hasContent) return

		setIsExporting(true)
		setExportSuccess(false)

		try {
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
			<div className="flex gap-4">
				<StatCard label="Notes" value={noteCount} />
				<StatCard label="Folders" value={folderCount} />
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-medium text-muted-foreground">Export Format</h3>
				<div className="grid gap-3">
					{exportOptions.map((option) => (
						<FormatOptionCard
							key={option.id}
							title={option.title}
							description={option.description}
							icon={option.icon}
							fileType={option.fileType}
							isSelected={selectedFormat === option.id}
							onClick={() => setSelectedFormat(option.id)}
						/>
					))}
				</div>
			</div>

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