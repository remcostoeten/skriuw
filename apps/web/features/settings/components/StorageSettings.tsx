'use client'

import { useState, useEffect } from 'react'
import { Button } from '@skriuw/ui/button'
import { Input } from '@skriuw/ui/input'
import { Label } from '@skriuw/ui/label'
import { saveUserUploadKey, clearUserUploadKey } from '../../uploads/save-user-upload-key'
import { getUserUploadKey } from '../../uploads/get-user-upload-key'
import { notify } from '@/lib/notify'

export function StorageSettings() {
	const [token, setToken] = useState('')
	const [hasExistingKey, setHasExistingKey] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isClearing, setIsClearing] = useState(false)

	useEffect(() => {
		async function checkExistingKey() {
			const existingKey = await getUserUploadKey()
			setHasExistingKey(!!existingKey)
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
				</div>
			</div>
		</div>
	)
}
