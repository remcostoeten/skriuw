'use client'

import { useState, useEffect } from 'react'
import { Button } from '@skriuw/ui/button'
import { Input } from '@skriuw/ui/input'
import { Label } from '@skriuw/ui/label'
import { saveUserUploadKey, clearUserUploadKey } from '../../uploads/save-user-upload-key'
import { getUserUploadKey } from '../../uploads/get-user-upload-key'
import {
	getNativeFilesystemPreference,
	getNativeStorageModePreference,
	setNativeFilesystemPreference,
	setNativeStorageMode,
	type NativeStorageMode
} from '@/app/storage'
import { notify } from '@/lib/notify'
import { getTauriStoragePaths, setTauriStoragePaths } from '@/lib/storage/tauri-storage-config'
import { isTauriAvailable } from '@skriuw/shared'

export function StorageSettings() {
	const [token, setToken] = useState('')
	const [hasExistingKey, setHasExistingKey] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isClearing, setIsClearing] = useState(false)
	const [isDesktop, setIsDesktop] = useState(false)
	const [nativeMode, setNativeMode] = useState<NativeStorageMode>('standard')
	const [preferFilesystem, setPreferFilesystem] = useState(false)
	const [dbPath, setDbPath] = useState('')
	const [fsPath, setFsPath] = useState('')
	const [isSavingPaths, setIsSavingPaths] = useState(false)

	useEffect(() => {
		async function checkExistingKey() {
			const existingKey = await getUserUploadKey()
			setHasExistingKey(!!existingKey)
		}

		const desktop = isTauriAvailable()
		setIsDesktop(desktop)
		if (desktop) {
			setNativeMode(getNativeStorageModePreference())
			setPreferFilesystem(getNativeFilesystemPreference())
			getTauriStoragePaths()
				.then((paths) => {
					setDbPath(paths.dbPath)
					setFsPath(paths.fsDir)
				})
				.catch((error) => {
					console.error('Failed to load Tauri storage paths:', error)
				})
		}

		checkExistingKey()
	}, [])

	async function handleSave() {
		if (!token.trim()) {
			notify('Please enter a token')
			return
		}

		setIsSaving(true)
		const result = await saveUserUploadKey(token.trim())
		setIsSaving(false)

		if (result.success) {
			notify('UploadThing token saved and encrypted')
			setHasExistingKey(true)
			setToken('')
		} else {
			notify(`Failed to save: ${result.error}`)
		}
	}

	async function handleClear() {
		setIsClearing(true)
		const result = await clearUserUploadKey()
		setIsClearing(false)

		if (result.success) {
			notify('Custom token removed. Using default.')
			setHasExistingKey(false)
		} else {
			notify(`Failed to clear: ${result.error}`)
		}
	}

	function handleNativeModeChange(mode: NativeStorageMode) {
		setNativeStorageMode(mode)
		setNativeMode(mode)
		notify('Desktop storage mode updated. Restart app to fully apply.')
	}

	function handleFilesystemPreferenceToggle() {
		const next = !preferFilesystem
		setNativeFilesystemPreference(next)
		setPreferFilesystem(next)
		notify('Filesystem preference updated. Restart app to fully apply.')
	}

	async function handleSavePaths() {
		if (!dbPath.trim() || !fsPath.trim()) {
			notify('Both DB and filesystem paths are required.')
			return
		}

		setIsSavingPaths(true)
		try {
			const result = await setTauriStoragePaths({ dbPath: dbPath.trim(), fsDir: fsPath.trim() })
			setDbPath(result.dbPath)
			setFsPath(result.fsDir)
			notify('Desktop storage paths saved. Restart app to fully apply.')
		} catch (error) {
			notify(`Failed to save storage paths: ${error instanceof Error ? error.message : String(error)}`)
		} finally {
			setIsSavingPaths(false)
		}
	}

	return (
		<div className='w-full max-w-2xl'>
			<div className='pb-4 mb-2 border-b border-border'>
				<h2 className='text-xl font-semibold text-foreground'>Storage</h2>
				<p className='text-sm text-muted-foreground mt-1'>
					Configure your file storage provider for uploads
				</p>
			</div>

			<div className='py-4'>
				<div className='space-y-4'>
					<div>
						<Label className='text-base font-medium text-foreground block'>
							UploadThing API Token
						</Label>
						<p className='text-sm text-muted-foreground leading-relaxed mt-0.5 mb-3'>
							{hasExistingKey
								? 'You have a custom token configured. Enter a new one to replace it.'
								: 'Add your own UploadThing token for private file storage. Your token will be encrypted.'}
						</p>
					</div>

					<div className='flex gap-2'>
						<Input
							type='password'
							value={token}
							onChange={(e) => setToken(e.target.value)}
							placeholder={
								hasExistingKey ? '••••••••••••••••' : 'Enter your UploadThing token'
							}
							className='flex-1'
						/>
						<Button onClick={handleSave} disabled={isSaving || !token.trim()}>
							{isSaving ? 'Saving...' : 'Save'}
						</Button>
					</div>

					{hasExistingKey && (
						<div className='pt-2'>
							<Button
								variant='outline'
								size='sm'
								onClick={handleClear}
								disabled={isClearing}
								className='text-destructive hover:text-destructive'
							>
								{isClearing ? 'Clearing...' : 'Remove Custom Token'}
							</Button>
							<p className='text-xs text-muted-foreground mt-1'>
								This will revert to the default storage provider.
							</p>
						</div>
					)}

					{isDesktop && (
						<div className='pt-6 border-t border-border space-y-4'>
							<div>
								<Label className='text-base font-medium text-foreground block'>
									Desktop Data Mode
								</Label>
								<p className='text-sm text-muted-foreground mt-0.5'>
									Privacy mode keeps data local only. Standard mode allows sync-capable
									strategy.
								</p>
							</div>

							<div className='flex gap-2'>
								<Button
									type='button'
									variant={nativeMode === 'standard' ? 'default' : 'outline'}
									onClick={() => handleNativeModeChange('standard')}
								>
									Standard
								</Button>
								<Button
									type='button'
									variant={nativeMode === 'privacy' ? 'default' : 'outline'}
									onClick={() => handleNativeModeChange('privacy')}
								>
									Privacy
								</Button>
							</div>

							<div className='flex items-center justify-between gap-3 rounded-md border border-border p-3'>
								<div>
									<p className='text-sm font-medium text-foreground'>
										Prefer filesystem backend
									</p>
									<p className='text-xs text-muted-foreground'>
										When enabled, filesystem is selected before SQLite when available.
									</p>
								</div>
								<Button
									type='button'
									variant={preferFilesystem ? 'default' : 'outline'}
									size='sm'
									onClick={handleFilesystemPreferenceToggle}
								>
									{preferFilesystem ? 'Enabled' : 'Disabled'}
								</Button>
							</div>

							<div className='space-y-3 rounded-md border border-border p-3'>
								<div>
									<Label className='text-sm font-medium text-foreground block'>SQLite DB Path</Label>
									<p className='text-xs text-muted-foreground mt-0.5'>
										Absolute path or path relative to app data directory.
									</p>
								</div>
								<Input
									value={dbPath}
									onChange={(e) => setDbPath(e.target.value)}
									placeholder='e.g. /Users/me/Skriuw/skriuw-storage.db'
								/>
								<div>
									<Label className='text-sm font-medium text-foreground block'>
										Filesystem Storage Directory
									</Label>
									<p className='text-xs text-muted-foreground mt-0.5'>
										Directory used for filesystem-backed records.
									</p>
								</div>
								<Input
									value={fsPath}
									onChange={(e) => setFsPath(e.target.value)}
									placeholder='e.g. /Users/me/Skriuw/storage-fs'
								/>
								<Button type='button' onClick={handleSavePaths} disabled={isSavingPaths}>
									{isSavingPaths ? 'Saving paths...' : 'Save Desktop Paths'}
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
