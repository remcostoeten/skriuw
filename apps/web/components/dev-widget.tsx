'use client'

import {
	Database,
	Trash2,
	Download,
	Upload,
	RefreshCw,
	Sprout,
	X,
	Loader2,
	Bug,
	Cookie,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@skriuw/core-logic'
import {
	downloadJsonExport,
	downloadMarkdownExport,
	importFromJson,
	importFromMarkdown,
} from '@/features/backup'
import { useNotesContext } from '@/features/notes'

type DbStats = {
	notes: number
	folders: number
	tasks: number
	settings: number
	shortcuts: number
	total: number
}

type DevApiResponse = {
	success?: boolean
	action?: string
	message?: string
	error?: string
	stats?: DbStats
	restartRequired?: boolean
	provider?: 'neon' | 'postgres'
}

export function DevWidget() {
	const { items, refreshItems } = useNotesContext()
	const [isOpen, setIsOpen] = useState(false)
	const [stats, setStats] = useState<DbStats | null>(null)
	const [provider, setProvider] = useState<'neon' | 'postgres' | null>(null)
	const [loading, setLoading] = useState(false)
	const [actionLoading, setActionLoading] = useState<string | null>(null)
	const [hasHeroCookie, setHasHeroCookie] = useState(false)

	// Cookie handling functions (matching page.tsx)
	const BADGE_COOKIE_NAME = 'hide-alpha-badge'

	function getHideBadgeCookie(): boolean {
		if (typeof window === 'undefined') return false

		const cookies = document.cookie.split(';')
		for (const cookie of cookies) {
			const [name, value] = cookie.trim().split('=')
			if (name === BADGE_COOKIE_NAME) {
				return value === 'true'
			}
		}
		return false
	}

	function setHideBadgeCookie(hide: boolean) {
		if (typeof window !== 'undefined') {
			if (hide) {
				document.cookie = `${BADGE_COOKIE_NAME}=true; max-age=${60 * 60 * 24 * 30}; path=/; secure; samesite=strict`
			} else {
				document.cookie = `${BADGE_COOKIE_NAME}=; max-age=0; path=/; secure; samesite=strict`
			}
		}
	}

	const fetchStats = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch('/api/dev')
			if (res.ok) {
				const data = await res.json()
				setStats(data.stats)
				if (data.provider) setProvider(data.provider)
			}
		} catch (error) {
			console.error('Failed to fetch dev stats', error)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (isOpen) {
			fetchStats()
			setHasHeroCookie(getHideBadgeCookie())
		}
	}, [isOpen, fetchStats])

	const toggleHeroCookie = () => {
		const newState = !hasHeroCookie
		setHideBadgeCookie(newState)
		setHasHeroCookie(newState)
		toast.success(newState ? 'Hero badge hidden' : 'Hero badge shown')
	}

	const executeAction = async (action: string, confirmMsg?: string) => {
		if (confirmMsg && !confirm(confirmMsg)) return
		setActionLoading(action)
		try {
			const res = await fetch('/api/dev', {
				method: 'POST',
				body: JSON.stringify({ action }),
				headers: { 'Content-Type': 'application/json' },
			})
			const data: DevApiResponse = await res.json()

			if (!res.ok) throw new Error(data.error || 'Action failed')

			toast.success(data.message || 'Action completed')

			if (data.restartRequired) {
				toast.info('Server is restarting. Page will reload automatically.')

				const pollServer = setInterval(async () => {
					try {
						const healthCheck = await fetch(window.location.origin)
						if (healthCheck.ok) {
							clearInterval(pollServer)
							toast.success('Server is back online. Reloading page...')
							setTimeout(() => window.location.reload(), 1000) // Give toast time to show
						}
					} catch (e) {
						// Server is not ready yet, do nothing.
					}
				}, 2000) // Poll every 2 seconds
			} else {
				await fetchStats()
				await refreshItems()
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Action failed')
			setActionLoading(null)
		}
	}

	const handleImport = (type: 'json' | 'md') => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = type === 'json' ? '.json' : '.md'
		input.multiple = type === 'md'

		input.onchange = async (e) => {
			const files = (e.target as HTMLInputElement).files
			if (!files?.length) return

			const toastId = toast.loading('Importing...')
			try {
				if (type === 'json') {
					await importFromJson(await files[0].text())
				} else {
					const contents = await Promise.all(
						Array.from(files).map(async (f) => ({ name: f.name, content: await f.text() }))
					)
					await importFromMarkdown(contents)
				}
				toast.success('Import successful', { id: toastId })
				await refreshItems()
				fetchStats()
			} catch (err) {
				toast.error('Import failed', { id: toastId })
			}
		}
		input.click()
	}

	if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') return null

	return (
		<>
			{!isOpen && (
				<button
					onClick={() => setIsOpen(true)}
					className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center animate-in fade-in zoom-in duration-200"
				>
					<Bug className="h-5 w-5" />
				</button>
			)}

			{isOpen && (
				<div className="fixed bottom-4 right-4 z-50 w-[320px] rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-2xl animate-in slide-in-from-bottom-5 duration-200 flex flex-col overflow-hidden">
					{/* Header */}
					<div className="flex items-center justify-between p-3 border-b bg-muted/30">
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[10px] font-medium">
								<div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
								DB CONNECTED
							</div>
							{provider && (
								<div
									className={cn(
										'flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium',
										provider === 'neon'
											? 'bg-orange-500/10 border-orange-500/20 text-orange-600'
											: 'bg-blue-500/10 border-blue-500/20 text-blue-600'
									)}
								>
									{provider === 'neon' ? 'NEON CLOUD' : 'LOCAL DOCKER'}
								</div>
							)}
							{provider && (
								<div className="mt-1 text-sm text-muted-foreground">
									Database: {provider === 'neon' ? 'Neon Cloud' : 'Local Docker'}
								</div>
							)}
						</div>
						<button
							onClick={() => setIsOpen(false)}
							className="hover:bg-muted rounded p-1 transition-colors"
						>
							<X className="h-4 w-4 text-muted-foreground" />
						</button>
					</div>

					<div className="p-3 space-y-4 text-sm max-h-[60vh] overflow-y-auto custom-scrollbar">
						{/* Stats Grid */}
						<div className="grid grid-cols-3 gap-2">
							<StatCard label="Notes" value={stats?.notes ?? '-'} loading={loading} />
							<StatCard label="Folders" value={stats?.folders ?? '-'} loading={loading} />
							<StatCard label="Tasks" value={stats?.tasks ?? '-'} loading={loading} />
						</div>

						{/* Actions Section */}
						<div className="space-y-2">
							<SectionLabel>Data Management</SectionLabel>
							<div className="grid grid-cols-2 gap-2">
								<ActionButton
									icon={Sprout}
									label="Seed Data"
									onClick={() => executeAction('seed')}
									loading={actionLoading === 'seed'}
								/>
								<ActionButton
									icon={Trash2}
									label="Clear Data"
									variant="destructive"
									onClick={() => executeAction('clear-all', 'Delete ALL data?')}
									loading={actionLoading === 'clear-all'}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<SectionLabel>Transfer</SectionLabel>
							<div className="grid grid-cols-2 gap-2">
								<div className="flex flex-col gap-1">
									<ActionButton
										icon={Download}
										label="Export JSON"
										onClick={() => downloadJsonExport(items)}
									/>
									<ActionButton
										icon={Download}
										label="Export MD"
										onClick={() => downloadMarkdownExport(items)}
									/>
								</div>
								<div className="flex flex-col gap-1">
									<ActionButton
										icon={Upload}
										label="Import JSON"
										onClick={() => handleImport('json')}
									/>
									<ActionButton
										icon={Upload}
										label="Import MD"
										onClick={() => handleImport('md')}
									/>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<SectionLabel>Cookies</SectionLabel>
							<ActionButton
								icon={Cookie}
								label={hasHeroCookie ? 'Show Hero Badge' : 'Hide Hero Badge'}
								onClick={toggleHeroCookie}
								fullWidth
							/>
						</div>

						<div className="space-y-2">
							<SectionLabel>Database Schema</SectionLabel>
							<div className="bg-muted/30 border rounded-lg p-2 space-y-2 text-xs">
								<div className="font-mono">
									<div className="flex items-center justify-between">
										<div className="font-semibold text-blue-600">notes</div>
										<div className="text-blue-600 font-bold">
											{loading ? '-' : (stats?.notes ?? 0)}
										</div>
									</div>
									<div className="text-muted-foreground">
										id, name, content, parentFolderId, pinned, pinnedAt, favorite, deletedAt,
										createdAt, updatedAt, type
									</div>
								</div>
								<div className="font-mono">
									<div className="flex items-center justify-between">
										<div className="font-semibold text-green-600">folders</div>
										<div className="text-green-600 font-bold">
											{loading ? '-' : (stats?.folders ?? 0)}
										</div>
									</div>
									<div className="text-muted-foreground">
										id, name, parentFolderId, pinned, pinnedAt, deletedAt, createdAt, updatedAt,
										type
									</div>
								</div>
								<div className="font-mono">
									<div className="flex items-center justify-between">
										<div className="font-semibold text-purple-600">tasks</div>
										<div className="text-purple-600 font-bold">
											{loading ? '-' : (stats?.tasks ?? 0)}
										</div>
									</div>
									<div className="text-muted-foreground">
										id, noteId, blockId, content, description, checked, dueDate, parentTaskId,
										position, createdAt, updatedAt
									</div>
								</div>
								<div className="font-mono">
									<div className="flex items-center justify-between">
										<div className="font-semibold text-orange-600">settings</div>
										<div className="text-orange-600 font-bold">
											{loading ? '-' : (stats?.settings ?? 0)}
										</div>
									</div>
									<div className="text-muted-foreground">id, key, value, createdAt, updatedAt</div>
								</div>
								<div className="font-mono">
									<div className="flex items-center justify-between">
										<div className="font-semibold text-pink-600">shortcuts</div>
										<div className="text-pink-600 font-bold">
											{loading ? '-' : (stats?.shortcuts ?? 0)}
										</div>
									</div>
									<div className="text-muted-foreground">
										id, keys, customizedAt, createdAt, updatedAt
									</div>
								</div>
								<div className="font-mono">
									<div className="flex items-center justify-between">
										<div className="font-semibold text-gray-600">total</div>
										<div className="text-gray-600 font-bold">
											{loading ? '-' : (stats?.total ?? 0)}
										</div>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<SectionLabel>System</SectionLabel>
							<ActionButton
								icon={RefreshCw}
								label="Restart Server"
								onClick={() => executeAction('clear-cache')}
								loading={actionLoading === 'clear-cache'}
								fullWidth
							/>
						</div>
					</div>
				</div>
			)}
		</>
	)
}

function StatCard({
	label,
	value,
	loading,
}: {
	label: string
	value: number | string
	loading: boolean
}) {
	return (
		<div className="bg-muted/30 border rounded-lg p-2 text-center">
			<div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
				{label}
			</div>
			<div className="text-lg font-bold tabular-nums text-foreground">
				{loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto my-1" /> : value}
			</div>
		</div>
	)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-0.5">
			{children}
		</div>
	)
}

function ActionButton({
	icon: Icon,
	label,
	onClick,
	loading,
	variant = 'default',
	fullWidth,
}: {
	icon: any
	label: string
	onClick: () => void
	loading?: boolean
	variant?: 'default' | 'destructive'
	fullWidth?: boolean
}) {
	return (
		<button
			onClick={onClick}
			disabled={loading}
			className={cn(
				'flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
				variant === 'default'
					? 'bg-background hover:bg-muted hover:border-border/80'
					: 'bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive/10',
				fullWidth ? 'w-full justify-center' : 'w-full justify-start'
			)}
		>
			{loading ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<Icon className="h-3.5 w-3.5" />
			)}
			{label}
		</button>
	)
}
