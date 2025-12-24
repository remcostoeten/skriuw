import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Link2, ShieldCheck, Unlink } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@skriuw/ui/alert'
import { Button } from '@skriuw/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'

import type { LinkedAccount } from '../api/account-client'
import { getLinkedAccounts, linkAccount, unlinkAccount } from '../api/account-client'

type ProviderId = 'github'

type Props = {
	userEmail: string
}

type PanelState = {
	loading: boolean
	error: string | null
	accounts: LinkedAccount[]
	busyProvider?: string
}

function providerLabel(provider: ProviderId): string {
	if (provider === 'github') return 'GitHub'
	return provider
}

function formatDate(value: string): string {
	const date = new Date(value)
	return date.toLocaleDateString()
}

export default function OAuthPanel({ userEmail }: Props) {
	const [state, setState] = useState<PanelState>({ loading: true, error: null, accounts: [] })

	const providerOptions = useMemo(
		function listProviders() {
			const providers: ProviderId[] = ['github']
			return providers
		},
		[]
	)

	useEffect(
		function loadAccounts() {
			let active = true
			async function fetchAccounts() {
				try {
					const accounts = await getLinkedAccounts()
					if (active) {
						setState({ loading: false, error: null, accounts })
					}
				} catch (loadError) {
					if (active) {
						setState({ loading: false, error: loadError instanceof Error ? loadError.message : 'Unable to load linked accounts', accounts: [] })
					}
				}
			}
			fetchAccounts()
			return function cleanup() {
				active = false
			}
		},
		[]
	)

	async function reloadAccounts() {
		try {
			const accounts = await getLinkedAccounts()
			setState({ loading: false, error: null, accounts })
		} catch (refreshError) {
			setState({ loading: false, error: refreshError instanceof Error ? refreshError.message : 'Unable to load linked accounts', accounts: [] })
		}
	}

	async function linkProvider(provider: ProviderId) {
		setState(function update(current) {
			return { ...current, busyProvider: provider, error: null }
		})
		try {
			const callbackURL = typeof window !== 'undefined' ? `${window.location.origin}/profile` : '/profile'
			const response = await linkAccount(provider, callbackURL)
			if (response.redirect && response.url) {
				window.location.assign(response.url)
				return
			}
			await reloadAccounts()
		} catch (linkError) {
			setState(function update(current) {
				return { ...current, error: linkError instanceof Error ? linkError.message : 'Unable to link account' }
			})
		} finally {
			setState(function update(current) {
				return { ...current, busyProvider: undefined }
			})
		}
	}

	async function unlinkProvider(account: LinkedAccount) {
		setState(function update(current) {
			return { ...current, busyProvider: account.providerId, error: null }
		})
		try {
			await unlinkAccount(account.providerId, account.accountId)
			await reloadAccounts()
		} catch (unlinkError) {
			setState(function update(current) {
				return { ...current, error: unlinkError instanceof Error ? unlinkError.message : 'Unable to unlink account' }
			})
		} finally {
			setState(function update(current) {
				return { ...current, busyProvider: undefined }
			})
		}
	}

	function renderAccount(account: LinkedAccount) {
		return (
			<li key={`${account.providerId}-${account.accountId}`} className="flex items-center justify-between rounded-lg border border-border/70 bg-card/60 px-3 py-2">
				<div className="flex flex-col gap-1 text-sm">
					<span className="font-medium">{providerLabel(account.providerId as ProviderId)}</span>
					<span className="text-xs text-muted-foreground">Linked on {formatDate(account.createdAt)}</span>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={function unlinkCurrent() {
						unlinkProvider(account)
					}}
					disabled={state.busyProvider === account.providerId}
					className="inline-flex items-center gap-2"
				>
					<Unlink className="h-4 w-4" />
					Unlink
				</Button>
			</li>
		)
	}

	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-2">
					<CardTitle className="text-xl">Connected sign-ins</CardTitle>
					<CardDescription>Link OAuth providers to your account and remove them at any time.</CardDescription>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<ShieldCheck className="h-4 w-4" />
					Signed in as {userEmail}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2">
					{providerOptions.map(function renderProvider(provider) {
						const linked = state.accounts.some(function match(account) {
							return account.providerId === provider
						})
						return (
							<Button
								key={provider}
								variant={linked ? 'secondary' : 'default'}
								size="sm"
								onClick={function onLink() {
									if (linked) return
									linkProvider(provider)
								}}
								disabled={state.busyProvider === provider || (linked && state.accounts.length === 1)}
								className="inline-flex items-center gap-2"
							>
								{linked ? <ExternalLink className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
								{linked ? 'Linked' : `Link ${providerLabel(provider)}`}
							</Button>
						)
					})}
				</div>

				{state.error && (
					<Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
						<AlertTitle>Connection issue</AlertTitle>
						<AlertDescription>{state.error}</AlertDescription>
					</Alert>
				)}

				{state.loading ? (
					<div className="flex items-center justify-center py-10 text-muted-foreground">Loading linked accounts…</div>
				) : state.accounts.length === 0 ? (
					<div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
						<p>No OAuth accounts linked yet.</p>
						<p>Link GitHub to sign in quickly without a password.</p>
					</div>
				) : (
					<ul className="space-y-2">{state.accounts.map(renderAccount)}</ul>
				)}
			</CardContent>
		</Card>
	)
}
