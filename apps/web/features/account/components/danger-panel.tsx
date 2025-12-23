import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@skriuw/ui/alert'
import { Button } from '@skriuw/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'

import { deleteAccount } from '../api/account-client'
import { signOut } from '@/lib/auth-client'
import { DeleteAccountDialog } from '../components/delete-account-dialog'

function audioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null
	const globalWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
	const Constructor = globalWindow.AudioContext || globalWindow.webkitAudioContext
	if (!Constructor) return null
	return new Constructor()
}

function soundAlert() {
	const context = audioContext()
	if (!context) return
	const oscillator = context.createOscillator()
	const gain = context.createGain()
	oscillator.type = 'sawtooth'
	oscillator.frequency.value = 180
	gain.gain.value = 0.0001
	oscillator.connect(gain)
	gain.connect(context.destination)
	const now = context.currentTime
	gain.gain.setValueAtTime(0.2, now)
	gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.8)
	oscillator.start(now)
	oscillator.stop(now + 0.85)
}

export default function DangerPanel() {
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [status, setStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function confirmDelete() {
		setIsDeleting(true)
		setError(null)
		setStatus(null)
		soundAlert()
		try {
			const response = await deleteAccount()
			setStatus(response.message)
			if (response.success) {
				await signOut()
			}
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete account')
		} finally {
			setIsDeleting(false)
			setIsDialogOpen(false)
		}
	}

	return (
		<Card className="border border-destructive/40 bg-destructive/5">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-xl text-destructive">
					<ShieldAlert className="h-5 w-5" />
					Danger zone
				</CardTitle>
				<CardDescription>Delete your account and all related data. This action cannot be undone once enabled.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="text-sm text-muted-foreground space-y-1">
					<p>Removing your account will revoke access to synced content across Skriuw.</p>
					<p>Deletion is immediate and signs you out automatically.</p>
				</div>
				<Button
					variant="outline"
					onClick={function openDialog() {
						soundAlert()
						setIsDialogOpen(true)
					}}
					className="w-full sm:w-auto text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5"
					disabled={isDeleting}
				>
					{isDeleting ? 'Processing…' : 'Delete account'}
				</Button>
			</CardContent>

			{status && (
				<Alert variant="default" className="mx-4 mb-4 border-border">
					<AlertTitle>Deletion started</AlertTitle>
					<AlertDescription>{status}</AlertDescription>
				</Alert>
			)}

			{error && (
				<Alert variant="destructive" className="mx-4 mb-4 border-destructive/40">
					<AlertTitle>Deletion failed</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<DeleteAccountDialog
				isOpen={isDialogOpen}
				onClose={function closeDialog() {
					setIsDialogOpen(false)
				}}
				onConfirm={confirmDelete}
				isDeleting={isDeleting}
			/>
		</Card>
	)
}
