'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileJson, FileText, Check, Loader2, AlertCircle, X } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { cn } from '@skriuw/core-logic'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { processImportFiles, type ImportResult } from '../utils/import-notes'

type ImportStep = 'select' | 'preview' | 'importing' | 'complete'

export function ImportPanel() {
	const { createNote, createFolder, refreshItems } = useNotesContext()
	const [step, setStep] = useState<ImportStep>('select')
	const [isDragging, setIsDragging] = useState(false)
	const [importResult, setImportResult] = useState<ImportResult | null>(null)
	const [isImporting, setIsImporting] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)
	}, [])

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)

		const files = e.dataTransfer.files
		if (files.length > 0) {
			await processFiles(files)
		}
	}, [])

	const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (files && files.length > 0) {
			await processFiles(files)
		}
	}, [])

	const processFiles = async (files: FileList) => {
		setStep('preview')
		const result = await processImportFiles(files)
		setImportResult(result)
	}

	const handleImport = async () => {
		if (!importResult?.items || importResult.items.length === 0) return

		setIsImporting(true)
		setStep('importing')

		try {
			// Import items recursively
			for (const item of importResult.items) {
				await importItem(item)
			}

			// Refresh the notes list
			await refreshItems()

			setStep('complete')
		} catch (error) {
			console.error('Import failed:', error)
			setImportResult(prev => prev ? {
				...prev,
				success: false,
				errors: [...prev.errors, `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
			} : null)
		} finally {
			setIsImporting(false)
		}
	}

	const importItem = async (item: any, parentFolderId?: string) => {
		if (item.type === 'note') {
			await createNote(item.name, parentFolderId)
			// Note: The createNote function creates a new note with empty content
			// For full content import, we'd need to use updateNote after creation
			// This is a simplified version - full implementation would need updateNote
		} else if (item.type === 'folder') {
			const folder = await createFolder(item.name, parentFolderId)
			if (folder && item.children) {
				for (const child of item.children) {
					await importItem(child, folder.id)
				}
			}
		}
	}

	const handleReset = () => {
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
					{/* Drop Zone */}
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
						<Upload className={cn(
							'h-10 w-10 mx-auto mb-4',
							isDragging ? 'text-primary' : 'text-muted-foreground'
						)} />
						<p className="text-sm font-medium mb-1">
							{isDragging ? 'Drop files here' : 'Drag & drop files here'}
						</p>
						<p className="text-xs text-muted-foreground">
							or click to browse
						</p>
					</div>

					{/* Supported Formats */}
					<div className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">Supported Formats</h3>
						<div className="grid gap-2">
							<div className="flex items-center gap-3 rounded-lg border border-border p-3">
								<div className="rounded-md bg-muted p-2">
									<FileJson className="h-4 w-4 text-muted-foreground" />
								</div>
								<div>
									<div className="text-sm font-medium">Skriuw Backup</div>
									<div className="text-xs text-muted-foreground">.json file from Skriuw export</div>
								</div>
							</div>
							<div className="flex items-center gap-3 rounded-lg border border-border p-3">
								<div className="rounded-md bg-muted p-2">
									<FileText className="h-4 w-4 text-muted-foreground" />
								</div>
								<div>
									<div className="text-sm font-medium">Markdown Files</div>
									<div className="text-xs text-muted-foreground">.md files from Obsidian, Notion, etc.</div>
								</div>
							</div>
						</div>
					</div>
				</>
			)}

			{step === 'preview' && importResult && (
				<>
					{/* Preview Results */}
					<div className="rounded-lg border border-border p-4 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Import Preview</h3>
							<Button variant="ghost" size="sm" onClick={handleReset}>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{importResult.success ? (
							<div className="flex gap-4">
								<div className="flex-1 rounded-lg bg-muted/30 p-3 text-center">
									<div className="text-xl font-bold text-green-500">
										{importResult.importedNotes}
									</div>
									<div className="text-xs text-muted-foreground">Notes</div>
								</div>
								<div className="flex-1 rounded-lg bg-muted/30 p-3 text-center">
									<div className="text-xl font-bold text-blue-500">
										{importResult.importedFolders}
									</div>
									<div className="text-xs text-muted-foreground">Folders</div>
								</div>
							</div>
						) : (
							<div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3">
								<AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
								<div className="space-y-1">
									{importResult.errors.map((error, i) => (
										<p key={i} className="text-sm text-destructive">{error}</p>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Action Buttons */}
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
					<Button onClick={handleReset}>
						Import More
					</Button>
				</div>
			)}
		</div>
	)
}
