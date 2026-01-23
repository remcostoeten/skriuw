import type { BackupManifest } from "../core/types";
import { useStorageConnectors } from "../hooks/use-storage-connectors";
import { processImportFiles, type ImportResult } from "../utils/import-notes";
import { FormatInfoCard, StatCard } from "./shared/import-export-ui";
import { useNotesContext } from "@/features/notes/context/notes-context";
import { cn } from "@skriuw/shared";
import { Button } from "@skriuw/ui/button";
import { Upload, FileJson, FileText, Check, Loader2, AlertCircle, X, Cloud, Clock } from "lucide-react";
import { useState, useCallback, useRef, useMemo } from "react";

type TImportStep = 'select' | 'preview' | 'importing' | 'complete' | 'cloud-select'

export function ImportPanel() {
	const { createNote, createFolder, refreshItems } = useNotesContext()
	const { connectors } = useStorageConnectors()
	const [step, setStep] = useState<TImportStep>('select')
	const [isDragging, setIsDragging] = useState(false)
	const [importResult, setImportResult] = useState<ImportResult | null>(null)
	const [isImporting, setIsImporting] = useState(false)

	// Cloud Restore State
	const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
	const [availableBackups, setAvailableBackups] = useState<BackupManifest[]>([])
	const [isLoadingBackups, setIsLoadingBackups] = useState(false)

	const fileInputRef = useRef<HTMLInputElement>(null)

	const connectedProviders = useMemo(
		() => connectors.filter((c) => c.status === 'connected'),
		[connectors]
	)

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
								`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
							]
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
		setSelectedProvider(null)
		setAvailableBackups([])
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	async function handleProviderSelect(type: string) {
		setSelectedProvider(type)
		setStep('cloud-select')
		setIsLoadingBackups(true)
		setAvailableBackups([])

		try {
			const connector = connectors.find((c) => c.type === type)
			if (!connector) throw new Error('Provider not found')

			let driver: any
			const { S3Driver } = await import('../core/drivers/s3-driver')
			const { DropboxDriver } = await import('../core/drivers/dropbox-driver')
			const { GoogleDriveDriver } = await import('../core/drivers/google-drive-driver')

			if (type === 's3') driver = new S3Driver()
			else if (type === 'dropbox') driver = new DropboxDriver()
			else if (type === 'google-drive') driver = new GoogleDriveDriver()

			await driver.init({
				config: connector.config as any
			})

			const manifests = await driver.listManifests()
			setAvailableBackups(manifests)
		} catch (error) {
			console.error('Failed to list backups:', error)
		} finally {
			setIsLoadingBackups(false)
		}
	}

	async function handleRestoreBackup(manifest: BackupManifest) {
		setIsImporting(true)
		setStep('importing')

		try {
			const connector = connectors.find((c) => c.type === selectedProvider)
			if (!connector) throw new Error('Provider not found')

			let driver: any
			const { S3Driver } = await import('../core/drivers/s3-driver')
			const { DropboxDriver } = await import('../core/drivers/dropbox-driver')
			const { GoogleDriveDriver } = await import('../core/drivers/google-drive-driver')

			if (connector.type === 's3') driver = new S3Driver()
			else if (connector.type === 'dropbox') driver = new DropboxDriver()
			else if (connector.type === 'google-drive') driver = new GoogleDriveDriver()

			await driver.init({ config: connector.config as any })

			// Fetch all chunks and reassemble
			const { restoreChunk } = await import('../core/engine')

			const chunks: Uint8Array[] = []

			// Sort chunks by index just in case
			const sortedMeta = [...manifest.chunks].sort((a, b) => a.index - b.index)

			for (const chunkMeta of sortedMeta) {
				const chunkData = await restoreChunk(driver, manifest.id, chunkMeta.id)
				chunks.push(chunkData)
			}

			// Combine chunks
			const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
			const result = new Uint8Array(totalLength)
			let offset = 0
			for (const chunk of chunks) {
				result.set(chunk, offset)
				offset += chunk.length
			}

			// Decode JSON
			const decoder = new TextDecoder()
			const jsonStr = decoder.decode(result)
			const backupData = JSON.parse(jsonStr)

			// Transform to ImportResult format
			// BackupData has .items same as ImportResult logic expects
			setImportResult({
				success: true,
				importedNotes: backupData.metadata?.totalNotes || 0,
				importedFolders: backupData.metadata?.totalFolders || 0,
				items: backupData.items,
				errors: []
			})

			// Proceed to import those items
			for (const item of backupData.items) {
				await importItem(item)
			}

			await refreshItems()
			setStep('complete')
		} catch (error) {
			console.error('Restore failed:', error)
			// Fallback to select to show error
			setStep('select')
		} finally {
			setIsImporting(false)
		}
	}

	return (
		<div className='space-y-6'>
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
							type='file'
							accept='.json,.md,.markdown'
							multiple
							onChange={handleFileSelect}
							className='absolute inset-0 w-full h-full opacity-0 cursor-pointer'
						/>
						<Upload
							className={cn(
								'h-10 w-10 mx-auto mb-4',
								isDragging ? 'text-primary' : 'text-muted-foreground'
							)}
						/>
						<p className='text-sm font-medium mb-1'>
							{isDragging ? 'Drop files here' : 'Drag & drop files here'}
						</p>
						<p className='text-xs text-muted-foreground'>or click to browse</p>
					</div>

					{connectedProviders.length > 0 && (
						<div className='space-y-3 pt-2'>
							<div className='flex items-center gap-2'>
								<div className='h-px bg-border flex-1' />
								<span className='text-xs text-muted-foreground font-medium uppercase'>
									Or restore from cloud
								</span>
								<div className='h-px bg-border flex-1' />
							</div>
							<div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
								{connectedProviders.map((p) => (
									<Button
										key={p.type}
										variant='outline'
										className='justify-start'
										onClick={() => handleProviderSelect(p.type)}
									>
										<Cloud className='h-4 w-4 mr-2' />
										{p.name}
									</Button>
								))}
							</div>
						</div>
					)}

					<div className='space-y-3'>
						<h3 className='text-sm font-medium text-muted-foreground'>
							Supported Formats
						</h3>
						<div className='grid gap-2'>
							<FormatInfoCard
								icon={<FileJson className='h-4 w-4' />}
								title='Skriuw Backup'
								description='.json file from Skriuw export'
							/>
							<FormatInfoCard
								icon={<FileText className='h-4 w-4' />}
								title='Markdown Files'
								description='.md files from Obsidian, Notion, etc.'
							/>
						</div>
					</div>
				</>
			)}

			{step === 'cloud-select' && (
				<div className='space-y-4'>
					<div className='flex items-center justify-between'>
						<h3 className='font-medium flex items-center gap-2'>
							<Cloud className='h-4 w-4' />
							Select Backup
						</h3>
						<Button variant='ghost' size='sm' onClick={handleReset}>
							<X className='h-4 w-4' />
						</Button>
					</div>

					{isLoadingBackups ? (
						<div className='py-8 flex justify-center'>
							<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
						</div>
					) : availableBackups.length === 0 ? (
						<div className='text-center py-8 text-muted-foreground space-y-2'>
							<p>No backups found.</p>
							<Button variant='link' onClick={handleReset}>
								Go back
							</Button>
						</div>
					) : (
						<div className='grid gap-2 max-h-[300px] overflow-y-auto'>
							{availableBackups.map((backup) => (
								<div
									key={backup.id}
									className='flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/50 transition-colors'
								>
									<div className='space-y-1'>
										<div className='font-medium text-sm flex items-center gap-2'>
											<Clock className='h-3 w-3 text-muted-foreground' />
											{new Date(backup.createdAt).toLocaleString()}
										</div>
										<div className='text-xs text-muted-foreground'>
											{backup.totalBytes
												? `${(backup.totalBytes / 1024 / 1024).toFixed(2)} MB`
												: 'Unknown size'}{' '}
											• v{backup.version}
										</div>
									</div>
									<Button size='sm' onClick={() => handleRestoreBackup(backup)}>
										Restore
									</Button>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{step === 'preview' && importResult && (
				<>
					<div className='rounded-lg border border-border p-4 space-y-4'>
						<div className='flex items-center justify-between'>
							<h3 className='font-medium'>Import Preview</h3>
							<Button variant='ghost' size='sm' onClick={handleReset}>
								<X className='h-4 w-4' />
							</Button>
						</div>

						{importResult.success ? (
							<div className='flex gap-4'>
								<StatCard
									label='Notes'
									value={importResult.importedNotes}
									variant='success'
								/>
								<StatCard
									label='Folders'
									value={importResult.importedFolders}
									variant='info'
								/>
							</div>
						) : (
							<div className='flex items-start gap-3 rounded-lg bg-destructive/10 p-3'>
								<AlertCircle className='h-5 w-5 text-destructive shrink-0 mt-0.5' />
								<div className='space-y-1'>
									{importResult.errors.map((error, i) => (
										<p key={i} className='text-sm text-destructive'>
											{error}
										</p>
									))}
								</div>
							</div>
						)}
					</div>

					<div className='flex gap-3'>
						<Button variant='outline' onClick={handleReset} className='flex-1'>
							Cancel
						</Button>
						<Button
							onClick={handleImport}
							disabled={!importResult.success || importResult.importedNotes === 0}
							className='flex-1'
						>
							<Upload className='h-4 w-4 mr-2' />
							Import {importResult.importedNotes} Notes
						</Button>
					</div>
				</>
			)}

			{step === 'importing' && (
				<div className='text-center py-8'>
					<Loader2 className='h-10 w-10 animate-spin text-primary mx-auto mb-4' />
					<p className='text-sm font-medium'>Importing notes...</p>
					<p className='text-xs text-muted-foreground mt-1'>This may take a moment</p>
				</div>
			)}

			{step === 'complete' && (
				<div className='text-center py-8'>
					<div className='rounded-full bg-green-500/10 p-4 w-fit mx-auto mb-4'>
						<Check className='h-8 w-8 text-green-500' />
					</div>
					<p className='text-lg font-medium mb-1'>Import Complete!</p>
					<p className='text-sm text-muted-foreground mb-6'>
						{importResult?.importedNotes} notes and {importResult?.importedFolders}{' '}
						folders imported
					</p>
					<Button onClick={handleReset}>Import More</Button>
				</div>
			)}
		</div>
	)
}
