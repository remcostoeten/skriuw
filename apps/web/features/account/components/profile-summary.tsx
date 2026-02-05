import { updateProfile } from '../api/account-client'
import type { useSession } from '@/lib/auth-client'
import { Alert, AlertDescription, AlertTitle } from '@skriuw/ui/alert'
import { Button } from '@skriuw/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { Input } from '@skriuw/ui/input'
import { Label } from '@skriuw/ui/label'
import { Camera, CheckCircle2, Loader2, Mail, User } from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'

type SessionData = ReturnType<typeof useSession>['data']
type SessionUser = NonNullable<SessionData>['user']

type Props = {
	user: SessionUser
	onRefresh: () => Promise<void>
}

function initialName(user: SessionUser): string {
	if (user && typeof user.name === 'string') return user.name
	return ''
}

function initialImage(user: SessionUser): string {
	if (typeof (user as { image?: unknown }).image === 'string') {
		return (user as { image: string }).image
	}
	return ''
}

function fileToDataUrl(file: File): Promise<string> {
	return new Promise(function executor(resolve, reject) {
		const reader = new FileReader()
		reader.onload = function handleLoad() {
			if (typeof reader.result === 'string') {
				resolve(reader.result)
			} else {
				reject(new Error('Could not read file'))
			}
		}
		reader.onerror = function handleError() {
			reject(new Error('Failed to read file'))
		}
		reader.readAsDataURL(file)
	})
}

function getStatusIcon(message: string | null) {
	if (!message) return null
	return <CheckCircle2 className='h-4 w-4 text-emerald-500' />
}

export default function ProfileSummary({ user, onRefresh }: Props) {
	const [name, setName] = useState(initialName(user))
	const [preview, setPreview] = useState(initialImage(user))
	const [status, setStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [isUploading, setIsUploading] = useState(false)

	const email = useMemo(
		function deriveEmail() {
			return (user.email as string | undefined) || 'Not set'
		},
		[user.email]
	)

	useEffect(
		function syncUser() {
			setName(initialName(user))
			setPreview(initialImage(user))
		},
		[user]
	)

	function updateName(event: ChangeEvent<HTMLInputElement>) {
		setName(event.target.value)
		setStatus(null)
		setError(null)
	}

	async function saveProfile(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setIsSaving(true)
		setStatus(null)
		setError(null)
		try {
			if (name.trim().length === 0) {
				throw new Error('Name cannot be empty')
			}
			await updateProfile({ name: name.trim() })
			await onRefresh()
			setStatus('Profile updated')
		} catch (profileError) {
			setError(
				profileError instanceof Error ? profileError.message : 'Could not update profile'
			)
		} finally {
			setIsSaving(false)
		}
	}

	async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		if (!file) return
		setError(null)
		setStatus(null)
		if (file.size > 1024 * 1024 * 3) {
			setError('Choose an image smaller than 3MB')
			return
		}
		setIsUploading(true)
		try {
			const dataUrl = await fileToDataUrl(file)
			await updateProfile({ image: dataUrl })
			setPreview(dataUrl)
			await onRefresh()
			setStatus('Avatar updated')
		} catch (uploadError) {
			setError(uploadError instanceof Error ? uploadError.message : 'Could not upload avatar')
		} finally {
			setIsUploading(false)
			if (event.target) {
				event.target.value = ''
			}
		}
	}

	return (
		<Card>
			<CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
				<div className='space-y-2'>
					<CardTitle className='flex items-center gap-2 text-xl'>
						<User className='h-5 w-5 text-muted-foreground' />
						Profile details
					</CardTitle>
					<CardDescription>
						Update your name and avatar. Changes are saved to your account immediately.
					</CardDescription>
				</div>
				<div className='flex items-center gap-3'>
					<div className='h-16 w-16 overflow-hidden rounded-full border border-border/60 bg-muted'>
						{preview ? (
							<img
								src={preview}
								alt='Profile avatar'
								className='h-full w-full object-cover'
							/>
						) : (
							<div className='flex h-full w-full items-center justify-center text-sm text-muted-foreground'>
								{name ? name[0]?.toUpperCase() : '👤'}
							</div>
						)}
					</div>
					<div className='flex flex-col gap-2 text-right'>
						<span className='text-sm font-medium'>{name || 'No name set'}</span>
						<span className='flex items-center gap-1 text-xs text-muted-foreground'>
							<Mail className='h-3.5 w-3.5' />
							{email}
						</span>
					</div>
				</div>
			</CardHeader>
			<CardContent className='space-y-6'>
				<form className='grid gap-4 sm:grid-cols-2' onSubmit={saveProfile}>
					<div className='space-y-2'>
						<Label htmlFor='name'>Display name</Label>
						<Input
							id='name'
							value={name}
							onChange={updateName}
							placeholder='How should we call you?'
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='avatar'>Avatar</Label>
						<div className='flex items-center gap-3'>
							<label
								className='inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-muted'
								htmlFor='avatar'
							>
								<Camera className='h-4 w-4' />
								<span>{isUploading ? 'Uploading…' : 'Upload image'}</span>
							</label>
							<input
								type='file'
								id='avatar'
								accept='image/*'
								className='sr-only'
								onChange={updateAvatar}
							/>
						</div>
						<p className='text-xs text-muted-foreground'>
							PNG, JPG or GIF up to 3MB. Stored securely via BetterAuth.
						</p>
					</div>
					<div className='sm:col-span-2 flex items-center gap-3'>
						<Button
							type='submit'
							disabled={isSaving || isUploading}
							className='w-full sm:w-auto'
						>
							{isSaving ? (
								<Loader2 className='h-4 w-4 animate-spin' />
							) : (
								'Save changes'
							)}
						</Button>
						{status && (
							<span className='flex items-center gap-2 text-sm text-emerald-600'>
								{getStatusIcon(status)}
								{status}
							</span>
						)}
					</div>
				</form>

				{error && (
					<Alert variant='destructive' className='border-destructive/30 bg-destructive/5'>
						<AlertTitle>Update failed</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	)
}
