'use client'

import { useState } from 'react'
import { AlertCircle, ShieldOff, UserRound, X, LogOut, LogIn } from 'lucide-react'

import { AUTH_CLIENT_ENABLED, signIn, signOut, useSession } from '@/lib/auth-client'
import { Button } from '@skriuw/ui/button'
import { cn } from '@skriuw/shared'

export function AuthStatus() {
	const { data: session, isPending, error } = useSession()
	const [dismissed, setDismissed] = useState(false)
	const [actionError, setActionError] = useState<string | null>(null)

	if (dismissed) return null

	const statusLabel = (() => {
                if (!AUTH_CLIENT_ENABLED) return 'Auth disabled: missing NEXT_PUBLIC_APP_URL'
                if (error) return 'Auth error — running in local-only mode'
                if (isPending) return 'Checking session...'
                if (session) return session.user?.email || 'Signed in'
                return 'Not signed in'
        })()

	const showWarning = !AUTH_CLIENT_ENABLED || Boolean(error)

	async function handleSignIn() {
		setActionError(null)
		try {
			await signIn.anonymous?.()
		} catch (err) {
			setActionError((err as Error).message || 'Failed to sign in')
		}
	}

	async function handleSignOut() {
		setActionError(null)
		try {
			await signOut()
		} catch (err) {
			setActionError((err as Error).message || 'Failed to sign out')
		}
	}

	return (
		<div className="fixed bottom-4 right-4 z-50 max-w-sm">
			<div
				className={cn(
					'rounded-lg border px-3 py-3 shadow-lg bg-background/90 backdrop-blur',
					showWarning ? 'border-amber-500/60' : 'border-border'
				)}
			>
				<div className="flex items-start gap-3">
					<div className={cn('p-2 rounded-md', showWarning ? 'bg-amber-500/10' : 'bg-muted')}>
						{showWarning ? (
							<ShieldOff className="h-4 w-4 text-amber-600 dark:text-amber-300" />
						) : (
							<UserRound className="h-4 w-4 text-foreground" />
						)}
					</div>
					<div className="flex-1">
						<div className="flex items-start justify-between">
							<div className="text-sm font-medium">{statusLabel}</div>
							<button
								className="p-1 text-muted-foreground hover:text-foreground"
								onClick={() => setDismissed(true)}
								aria-label="Dismiss auth status"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						{actionError && (
							<p className="mt-1 text-xs text-destructive flex items-center gap-1">
								<AlertCircle className="h-3 w-3" />
								{actionError}
							</p>
						)}
						<div className="mt-3 flex gap-2">
							{session ? (
								<Button size="sm" variant="outline" onClick={handleSignOut}>
									<LogOut className="h-4 w-4 mr-1" />
									Sign out
								</Button>
							) : (
								<Button
									size="sm"
									variant={showWarning ? 'destructive' : 'default'}
									onClick={handleSignIn}
									disabled={!AUTH_CLIENT_ENABLED || isPending}
								>
									<LogIn className="h-4 w-4 mr-1" />
									{showWarning ? 'Retry (local-only)' : 'Sign in'}
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
