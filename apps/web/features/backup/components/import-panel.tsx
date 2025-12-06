'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileJson, FileText, Check, Loader2, AlertCircle, X } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { cn } from '@skriuw/core-logic'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { processImportFiles, type ImportResult } from '../utils/import-notes'
import { FormatInfoCard, StatCard } from './shared/import-export-ui'

type TImportStep = 'select' | 'preview' | 'importing' | 'complete'

export function ImportPanel() {
	const { createNote, createFolder, refreshItems } = useNotesContext()
	const [step, setStep] = useState<TImportStep>('select')
	const [isDragging, setIsDragging] = useState(false)
	const [importResult, setImportResult] = useState<ImportResult | null>(null)
	const [isImporting, setIsImporting] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleDragOver = useCallback(function (e: React.DragEvent) {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(true)
	}, [])

	const handleDragLeave = useCallback(function (e: React.DragEvent) {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)
	}, [])

	const handleDrop = useCallback(async function (e: React.DragEvent) {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)

		const files = e.dataTransfer.files
		if (files.length > 0) {
			await processFiles(files)
		}
	}, [])

	const handleFileSelect = useCallback(async function (e: React.ChangeEvent<HTMLInputElement>) {
		const files = e.target.files
		if (files && files.length > 0) {
			await processFiles(files)
		}
	}, [])

	async function processFiles(files: FileList) {
		setStep('preview')
		const result = await processImportFiles(files)
		setImportResult(result)
	}

	async function handleImport() {
		if (!importResult?.items || importResult.items.length === 0) return

		setIsImporting(true)
		setStep('importing')

		try {
			for (const item of importResult.items) {
				await importItem(item)
			}

			await refreshItems()

			setStep('complete')
		} catch (error) {
			console.error('Import failed:', error)
			setImportResult((prev) =>
				prev
					? {
						...prev,
						success: false,
						errors: [
							...prev.errors,
							`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
						],
					}
					: null
			)
		} finally {
			setIsImporting(false)
		}
	}

	async function importItem(item: any, parentFolderId?: string) {
		if (item.type === 'note') {
			await createNote(item.name, parentFolderId)
		} else if (item.type === 'folder') {
			const folder = await createFolder(item.name, parentFolderId)
			if (folder && item.children) {
				for (const child of item.children) {
					await importItem(child, folder.id)
				}
			}
		}
	}

	function handleReset() {
		setStep('select')
		setImportResult(null)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	return (
		<div className="space-y-6">
			{step === 'select' && (
				<>
					<div
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						className={cn(
							'relative rounded-lg border-2 border-dashed p-8 text-center transition-all',
							isDragging
								? 'border-primary bg-primary/5'
								: 'border-border hover:border-muted-foreground/50'
						)}
					>
						<input
							ref={fileInputRef}
							type="file"
							accept=".json,.md,.markdown"
							multiple
							onChange={handleFileSelect}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<Upload
							className={cn(
								'h-10 w-10 mx-auto mb-4',
								isDragging ? 'text-primary' : 'text-muted-foreground'
							)}
						/>
						<p className="text-sm font-medium mb-1">
							{isDragging ? 'Drop files here' : 'Drag & drop files here'}
						</p>
						<p className="text-xs text-muted-foreground">or click to browse</p>
					</div>

					<div className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">Supported Formats</h3>
						<div className="grid gap-2">
							<FormatInfoCard
								icon={<FileJson className="h-4 w-4" />}
								title="Skriuw Backup"
								description=".json file from Skriuw export"
							/>
							<FormatInfoCard
								icon={<FileText className="h-4 w-4" />}
								title="Markdown Files"
								description=".md files from Obsidian, Notion, etc."
							/>
						</div>
					</div>
				</>
			)}

			{step === 'preview' && importResult && (
				<>
					<div className="rounded-lg border border-border p-4 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Import Preview</h3>
							<Button variant="ghost" size="sm" onClick={handleReset}>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{importResult.success ? (
							<div className="flex gap-4">
								<StatCard
									label="Notes"
									value={importResult.importedNotes}
									variant="success"
								/>
								<StatCard
									label="Folders"
									value={importResult.importedFolders}
									variant="info"
								/>
							</div>
						) : (
							<div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3">
								<AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
								<div className="space-y-1">
									{importResult.errors.map((error, i) => (
										<p key={i} className="text-sm text-destructive">
											{error}
										</p>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="flex gap-3">
						<Button variant="outline" onClick={handleReset} className="flex-1">
							Cancel
						</Button>
						<Button
							onClick={handleImport}
							disabled={!importResult.success || importResult.importedNotes === 0}
							className="flex-1"
						>
							<Upload className="h-4 w-4 mr-2" />
							Import {importResult.importedNotes} Notes
						</Button>
					</div>
				</>
			)}

			{step === 'importing' && (
				<div className="text-center py-8">
					<Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
					<p className="text-sm font-medium">Importing notes...</p>
					<p className="text-xs text-muted-foreground mt-1">This may take a moment</p>
				</div>
			)}

			{step === 'complete' && (
				<div className="text-center py-8">
					<div className="rounded-full bg-green-500/10 p-4 w-fit mx-auto mb-4">
						<Check className="h-8 w-8 text-green-500" />
					</div>
					<p className="text-lg font-medium mb-1">Import Complete!</p>
					<p className="text-sm text-muted-foreground mb-6">
						{importResult?.importedNotes} notes and {importResult?.importedFolders} folders imported
					</p>
					<Button onClick={handleReset}>Import More</Button>
				</div>
			)}
		</div>
	)
}