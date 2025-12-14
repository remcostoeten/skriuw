'use client'

import { Download, FileJson, FileText, Check, Loader2, Cloud } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { cn } from '@skriuw/shared'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { useStorageConnectors } from '../hooks/use-storage-connectors'
import { downloadJsonExport, downloadMarkdownExport, exportAsJson, type ExportFormat } from '../utils/export-notes'
import { FormatOptionCard, StatCard } from './shared/import-export-ui'
import { useState, useMemo } from 'react'

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
	const { connectors } = useStorageConnectors()
	const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
	const [selectedDestination, setSelectedDestination] = useState<string>('download')
	const [isExporting, setIsExporting] = useState(false)
	const [exportSuccess, setExportSuccess] = useState(false)
	const [statusMessage, setStatusMessage] = useState('')

	const { notes: noteCount, folders: folderCount } = countItems(items)
	const hasContent = noteCount > 0 || folderCount > 0

	const availableDestinations = useMemo(() => {
		const dests = [{ id: 'download', label: 'Local Download', icon: Download }]
		connectors.forEach((c) => {
			if (c.status === 'connected') {
				dests.push({
					id: c.type,
					label: c.name,
					icon: Cloud,
				})
			}
		})
		return dests
	}, [connectors])

	async function handleExport() {
		if (!hasContent) return

		setIsExporting(true)
		setExportSuccess(false)
		setStatusMessage(selectedDestination === 'download' ? 'Preparing download...' : 'Uploading backup...')

		try {
			// 1. Generate Data
			await new Promise((resolve) => setTimeout(resolve, 300))

			if (selectedDestination === 'download') {
				if (selectedFormat === 'json') {
					downloadJsonExport(items, { includeMetadata: true })
				} else {
					downloadMarkdownExport(items)
				}
				setStatusMessage('Downloaded!')
			} else {
				// Cloud Backup (JSON only to keep it simple for restore)
				if (selectedFormat !== 'json') {
					// Force JSON for cloud backups for now, or warn user. 
					// Ideally we zip markdown but we don't have zip lib here yet.
					// Implicitly doing JSON for cloud backup. 
				}
				const jsonContent = exportAsJson(items, { includeMetadata: true, format: 'json' })
				const encoder = new TextEncoder()
				const data = encoder.encode(jsonContent)

				// 2. Create Driver
				const connector = connectors.find(c => c.type === selectedDestination)
				if (!connector) throw new Error('Destination not found')

				let driver: any
				const { S3Driver } = await import('../core/drivers/s3-driver')
				const { DropboxDriver } = await import('../core/drivers/dropbox-driver')
				const { GoogleDriveDriver } = await import('../core/drivers/google-drive-driver')

				if (connector.type === 's3') {
					driver = new S3Driver()
				} else if (connector.type === 'dropbox') {
					driver = new DropboxDriver()
				} else if (connector.type === 'google-drive') {
					driver = new GoogleDriveDriver()
				} else {
					throw new Error('Unsupported provider')
				}

				// 3. Init Driver
				// Map connector config to flat record string
				await driver.init({
					id: connector.id,
					type: connector.type,
					name: connector.name,
					enabled: true,
					encrypt: false,
					config: connector.config as any
				})

				// 4. Run Backup
				const { runBackup } = await import('../core/engine')
				await runBackup({
					driver,
					destination: {
						id: connector.id,
						type: connector.type,
						name: connector.name,
						enabled: true,
						encrypt: false,
						config: connector.config as any
					},
					payload: {
						version: '1.0',
						bytes: data,
						metadata: { noteCount, folderCount }
					}
				})

				setStatusMessage('Upload complete!')
			}

			setExportSuccess(true)
			setTimeout(() => {
				setExportSuccess(false)
				setStatusMessage('')
			}, 3000)
		} catch (error) {
			console.error('Export failed:', error)
			setStatusMessage('Failed: ' + (error instanceof Error ? error.message : String(error)))
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
				<StatCard label="Notes ready to export" value={noteCount} />
				<StatCard label="Folders" value={folderCount} />
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-medium text-muted-foreground">Destination</h3>
				<div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
					{availableDestinations.map(dest => (
						<div
							key={dest.id}
							onClick={() => setSelectedDestination(dest.id)}
							className={cn(
								"flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
								selectedDestination === dest.id
									? "border primary/55	"
									: "border hover:bg-muted/50"
							)}
						>
							<div className={cn("p-2 rounded-md", selectedDestination === dest.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
								<dest.icon className="h-5 w-5" />
							</div>
							<div className="flex-1">
								<div className="font-medium text-sm">{dest.label}</div>
							</div>
							{selectedDestination === dest.id && <Check className="h-4 w-4 text-primary" />}
						</div>
					))}
				</div>
				{connectors.length === 0 && (
					<p className="text-xs text-muted-foreground px-1">
						Connect cloud providers in the <strong>Storage</strong> tab to enable cloud backups.
					</p>
				)}
			</div>

			{selectedDestination === 'download' && (
				<div className="space-y-3">
					<h3 className="text-sm font-medium text-muted-foreground">Format</h3>
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
			)}

			<Button
				onClick={handleExport}
				disabled={!hasContent || isExporting}
				className="w-full"
			>
				{isExporting ? (
					<>
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						{statusMessage || 'Processing...'}
					</>
				) : exportSuccess ? (
					<>
						<Check className="h-4 w-4 mr-2" />
						{statusMessage || 'Done!'}
					</>
				) : (
					<>
						{selectedDestination === 'download' ? <Download className="h-4 w-4 mr-2" /> : <Cloud className="h-4 w-4 mr-2" />}
						{selectedDestination === 'download' ? 'Export' : 'Upload Backup'}
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
