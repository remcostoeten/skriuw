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
	GripVertical,
	Users,
	Clock,
	Play,
	CheckCircle,
	XCircle,
	Settings,
	Activity,
	Calendar,
	Shield,
	Trash,
	UserCheck,
	Grip,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@skriuw/shared'
import {
	downloadJsonExport,
	downloadMarkdownExport,
	importFromJson,
	importFromMarkdown,
} from '@/features/backup'
import { useNotesContext } from '@/features/notes'
import { useDraggable } from '@/hooks/use-draggable'
import { useCookie } from '@/hooks/use-cookie'

type DbStats = {
	notes: number
	folders: number
	tasks: number
	settings: number
	shortcuts: number
	total: number
	users?: number
	anonymousUsers?: number
	anonymousUsersOld?: number
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

type UserInfo = {
	id: string
	isAnonymous: boolean
	createdAt: string
	email?: string
	name?: string
}

type CronStatus = {
	lastRun?: string
	nextRun?: string
	status: 'success' | 'failed' | 'never'
	totalDeleted: number
	runHistory: Array<{
		timestamp: string
		status: 'success' | 'failed'
		usersDeleted: number
		error?: string
	}>
}

type TabType = 'database' | 'users' | 'cron' | 'health' | 'config'

export function DevWidget() {
	const { items, refreshItems } = useNotesContext()
	const [isOpen, setIsOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<TabType>('database')
	const [stats, setStats] = useState<DbStats | null>(null)
	const [provider, setProvider] = useState<'neon' | 'postgres' | null>(null)
	const [loading, setLoading] = useState(false)
	const [actionLoading, setActionLoading] = useState<string | null>(null)
	const [isConnected, setIsConnected] = useState<boolean | null>(null)
	const { value: hideBadgeCookie, updateCookie, deleteCookie } = useCookie('hide-alpha-badge')
	const hasHeroCookie = hideBadgeCookie === 'true'

	// New states for user/cron management
	const [users, setUsers] = useState<UserInfo[]>([])
	const [cronStatus, setCronStatus] = useState<CronStatus>({
		status: 'never',
		totalDeleted: 0,
		runHistory: []
	})
	const [usersLoading, setUsersLoading] = useState(false)
	const [cleanupLoading, setCleanupLoading] = useState(false)

	// Resize state
	const [size, setSize] = useState({ width: 450, height: 500 })
	const [resizeStart, setResizeStart] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

	// Load saved size
	useEffect(() => {
		const saved = localStorage.getItem('dev-widget-size')
		if (saved) {
			try {
				setSize(JSON.parse(saved))
			} catch (e) {
				console.error('Failed to parse widget size', e)
			}
		}
	}, [])

	// Save size on change (debounced by resize end)
	useEffect(() => {
		if (!resizeStart) {
			localStorage.setItem('dev-widget-size', JSON.stringify(size))
		}
	}, [size, resizeStart])

	// Handle resizing
	useEffect(() => {
		if (!resizeStart) return

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = e.clientX - resizeStart.x
			const deltaY = e.clientY - resizeStart.y
			setSize({
				width: Math.max(320, resizeStart.w + deltaX),
				height: Math.max(300, resizeStart.h + deltaY),
			})
		}

		const handleMouseUp = () => {
			setResizeStart(null)
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [resizeStart])

	// Click vs drag detection
	const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null)
	const [hasMoved, setHasMoved] = useState(false)

	// Draggable functionality
	const {
		dragRef,
		position,
		isDragging,
		handleMouseDown,
		handleTouchStart,
		resetPosition,
	} = useDraggable({
		initialPosition: { x: 50, y: 100 }, // Simple default position
		storageKey: 'dev-widget-position',
		bounds: {
			// Keep within viewport with some margin
			left: -320, // Allow to be mostly off-screen left
			top: -100, // Allow to be mostly off-screen top
		},
	})

	const fetchStats = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch('/api/dev')
			if (res.ok) {
				const data = await res.json()
				setStats(data.stats)
				if (data.provider) setProvider(data.provider)
				setIsConnected(true)
			} else {
				setIsConnected(false)
			}
		} catch (error) {
			console.error('Failed to fetch dev stats', error)
			setIsConnected(false)
		} finally {
			setLoading(false)
		}
	}, [])

	const fetchUsers = useCallback(async () => {
		setUsersLoading(true)
		try {
			const res = await fetch('/api/dev/users')
			if (res.ok) {
				const data = await res.json()
				setUsers(data.users || [])
			}
		} catch (error) {
			console.error('Failed to fetch users', error)
			toast.error('Failed to fetch users')
		} finally {
			setUsersLoading(false)
		}
	}, [])

	const runCleanup = useCallback(async (dryRun = false) => {
		setCleanupLoading(true)
		try {
			const res = await fetch('/api/cron/cleanup', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					// For development, we'll use a simple auth that can be bypassed
					'Authorization': `Bearer dev-cleanup-secret`
				},
				body: JSON.stringify({ dryRun })
			})

			const data = await res.json()

			if (!res.ok) {
				throw new Error(data.error || 'Cleanup failed')
			}

			toast.success(data.message || (dryRun ? 'Dry run completed' : 'Cleanup completed'))

			// Update cron status
			setCronStatus(prev => ({
				...prev,
				lastRun: new Date().toISOString(),
				status: 'success',
				totalDeleted: prev.totalDeleted + (data.deletedCount || 0),
				runHistory: [
					{
						timestamp: new Date().toISOString(),
						status: 'success',
						usersDeleted: data.deletedCount || 0
					},
					...prev.runHistory.slice(0, 9) // Keep last 10 runs
				]
			}))

			// Refresh stats and users
			await fetchStats()
			await fetchUsers()
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Cleanup failed'
			toast.error(errorMsg)

			// Update cron status with failure
			setCronStatus(prev => ({
				...prev,
				lastRun: new Date().toISOString(),
				status: 'failed',
				runHistory: [
					{
						timestamp: new Date().toISOString(),
						status: 'failed',
						usersDeleted: 0,
						error: errorMsg
					},
					...prev.runHistory.slice(0, 9)
				]
			}))
		} finally {
			setCleanupLoading(false)
		}
	}, [fetchStats, fetchUsers])

	useEffect(() => {
		if (isOpen && activeTab === 'users') {
			fetchUsers()
		}
	}, [isOpen, activeTab, fetchUsers])

	// Track mouse movement to detect click vs drag
	useEffect(() => {
		if (!dragStartPos) return

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = Math.abs(e.clientX - dragStartPos.x)
			const deltaY = Math.abs(e.clientY - dragStartPos.y)
			const threshold = 5 // 5px threshold to distinguish click from drag

			if (deltaX > threshold || deltaY > threshold) {
				setHasMoved(true)
			}
		}

		const handleMouseUp = () => {
			// Don't reset state here - let click handler handle it
			// This prevents race condition between mouseup and click events
			// Reset after a short delay to handle cases where click doesn't fire
			setTimeout(() => {
				setDragStartPos(null)
				setHasMoved(false)
			}, 100)
		}

		if (dragStartPos) {
			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [dragStartPos])

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
				let importResult
				if (type === 'json') {
					importResult = await importFromJson(await files[0].text())
				} else {
					const contents = await Promise.all(
						Array.from(files).map(async (f) => ({ name: f.name, content: await f.text() }))
					)
					importResult = await importFromMarkdown(contents)
				}

				if (!importResult.success) {
					throw new Error(importResult.errors.join(', '))
				}

				// Send to API
				const res = await fetch('/api/import', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ items: importResult.items }),
				})

				if (!res.ok) {
					const data = await res.json()
					throw new Error(data.error || 'Import failed on server')
				}

				toast.success('Import successful', { id: toastId })
				await refreshItems()
				fetchStats()
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Import failed', { id: toastId })
			}
		}
		input.click()
	}

	if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') return null

	return (
		<>
			{!isOpen && (
				<button
					ref={dragRef as any}
					onClick={() => {
						// Only toggle if we haven't moved (i.e., it was a click, not a drag)
						if (!hasMoved && dragStartPos) {
							setIsOpen(true)
						}
						// Reset drag detection state
						setHasMoved(false)
						setDragStartPos(null)
					}}
					onMouseDown={(e) => {
						// Track initial position for click vs drag detection
						setDragStartPos({ x: e.clientX, y: e.clientY })
						setHasMoved(false)
						handleMouseDown(e)
					}}
					onTouchStart={(e) => {
						// Track initial position for touch events
						const touch = e.touches[0]
						setDragStartPos({ x: touch.clientX, y: touch.clientY })
						setHasMoved(false)
						handleTouchStart(e)
					}}
					className={cn(
						'fixed z-50 h-10 w-10 rounded-full border border-border bg-background/80 backdrop-blur-sm text-muted-foreground shadow-lg hover:shadow-xl hover:bg-accent hover:text-accent-foreground transition-all flex items-center justify-center animate-in fade-in zoom-in duration-200',
						isDragging && 'cursor-grabbing'
					)}
					style={{
						left: position.x + 8, // Center the button in the widget area
						top: position.y + 8,
						right: 'auto',
						bottom: 'auto',
					}}
				>
					<Bug className="h-5 w-5" />
				</button>
			)}

			{isOpen && (
				<div
					ref={dragRef}
					className={cn(
						'fixed z-50 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-2xl duration-0 flex flex-col overflow-hidden',
						isDragging && 'cursor-grabbing'
					)}
					style={{
						left: position.x,
						top: position.y,
						width: size.width,
						height: size.height,
						right: 'auto',
						bottom: 'auto',
					}}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
				>
					{/* Header */}
					<div className="flex items-center justify-between p-3 border-b bg-background/95 backdrop-blur-sm	 cursor-grab active:cursor-grabbing">
						<div className="flex items-center gap-2">
							<GripVertical className="h-4 w-4 text-muted-foreground" />
							<div
								className={cn(
									'flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium transition-colors',
									isConnected
										? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
										: 'bg-red-500/10 border-red-500/20 text-red-600'
								)}
							>
								<div
									className={cn(
										'h-1.5 w-1.5 rounded-full animate-pulse',
										isConnected ? 'bg-emerald-500' : 'bg-red-500'
									)}
								/>
								{isConnected ? 'DB CONNECTED' : 'DB DOWN'}
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
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation()
								setIsOpen(false)
							}}
							onMouseDown={(e) => e.stopPropagation()}
							className="hover:bg-muted rounded p-1 transition-colors cursor-pointer"
						>
							<X className="h-4 w-4 text-muted-foreground" />
						</button>
					</div>

					{/* Tab Navigation */}
					<div className="flex border-b bg-muted/30 overflow-x-auto">
						{[
							{ id: 'database' as TabType, icon: Database, label: 'Database' },
							{ id: 'users' as TabType, icon: Users, label: 'Users' },
							{ id: 'cron' as TabType, icon: Clock, label: 'Cron' },
							{ id: 'health' as TabType, icon: Activity, label: 'Health' },
							{ id: 'config' as TabType, icon: Settings, label: 'Config' },
						].map((tab) => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={cn(
									'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap min-w-fit flex-1 justify-center',
									activeTab === tab.id
										? 'border-primary text-primary bg-background/50'
										: 'border-transparent text-muted-foreground hover:text-foreground hover:bg-background/30'
								)}
								onMouseDown={(e) => e.stopPropagation()}
							>
								<tab.icon className="h-3.5 w-3.5" />
								{tab.label}
							</button>
						))}
					</div>

					<div
						className="p-3 space-y-4 text-sm flex-1 overflow-y-auto custom-scrollbar"
						onMouseDown={(e) => e.stopPropagation()}
						onTouchStart={(e) => e.stopPropagation()}
					>
						{/* Database Tab Content */}
						{activeTab === 'database' && (
							<>
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
										fullWidth
										onClick={() => {
											if (hasHeroCookie) {
												deleteCookie()
												toast.success('Hero badge is now visible')
											} else {
												updateCookie('true')
												toast.success('Hero badge is now hidden')
											}
										}}
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
									<div className="grid grid-cols-2 gap-2">
										<ActionButton
											icon={RefreshCw}
											label="Clear Cache"
											onClick={() => executeAction('clear-cache')}
											loading={actionLoading === 'clear-cache'}
										/>
										<ActionButton
											icon={Download}
											label="Reset Position"
											onClick={resetPosition}
											variant="default"
										/>
									</div>
								</div>
							</>
						)}

						{/* Users Tab Content */}
						{activeTab === 'users' && (
							<>
								<div className="space-y-2">
									<SectionLabel>User Statistics</SectionLabel>
									<div className="grid grid-cols-2 gap-2">
										<StatCard label="Total Users" value={stats?.users ?? '-'} loading={loading} />
										<StatCard label="Anonymous" value={stats?.anonymousUsers ?? '-'} loading={loading} />
									</div>
									<StatCard label="Pending Deletion" value={stats?.anonymousUsersOld ?? '-'} loading={loading} />
								</div>

								<div className="space-y-2">
									<SectionLabel>User Management</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-2 space-y-1 text-xs max-h-60 overflow-y-auto">
										{usersLoading ? (
											<div className="flex items-center justify-center py-4">
												<Loader2 className="h-4 w-4 animate-spin" />
											</div>
										) : users.length === 0 ? (
											<div className="text-muted-foreground text-center py-4">No users found</div>
										) : (
											users.map((user) => (
												<div key={user.id} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50">
													<div className="flex items-center gap-2">
														{user.isAnonymous ? (
															<div className="h-2 w-2 rounded-full bg-orange-500" />
														) : (
															<div className="h-2 w-2 rounded-full bg-green-500" />
														)}
														<div className="font-mono text-[10px]">{user.id.slice(-8)}</div>
														{user.email && <div className="text-muted-foreground">{user.email}</div>}
													</div>
													<div className="text-right">
														<div className="text-[10px] text-muted-foreground">
															{new Date(user.createdAt).toLocaleDateString()}
														</div>
														<div className="text-[9px] text-muted-foreground">
															{new Date(user.createdAt).toLocaleTimeString()}
														</div>
													</div>
												</div>
											))
										)}
									</div>
								</div>

								<div className="space-y-2">
									<ActionButton
										icon={Users}
										label="Refresh Users"
										onClick={fetchUsers}
										loading={usersLoading}
									/>
								</div>
							</>
						)}

						{/* Cron Tab Content */}
						{activeTab === 'cron' && (
							<>
								<div className="space-y-2">
									<SectionLabel>Cleanup Status</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-3 space-y-3">
										<div className="flex items-center justify-between">
											<span className="text-xs font-medium">Status</span>
											<div className={cn(
												'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium',
												cronStatus.status === 'success' ? 'bg-emerald-500/10 text-emerald-600' :
													cronStatus.status === 'failed' ? 'bg-red-500/10 text-red-600' :
														'bg-gray-500/10 text-gray-600'
											)}>
												{cronStatus.status === 'success' && <CheckCircle className="h-3 w-3" />}
												{cronStatus.status === 'failed' && <XCircle className="h-3 w-3" />}
												{cronStatus.status === 'never' && <Clock className="h-3 w-3" />}
												{cronStatus.status.toUpperCase()}
											</div>
										</div>

										<div className="flex items-center justify-between">
											<span className="text-xs font-medium">Total Deleted</span>
											<span className="text-xs font-bold">{cronStatus.totalDeleted}</span>
										</div>

										{cronStatus.lastRun && (
											<div className="flex items-center justify-between">
												<span className="text-xs font-medium">Last Run</span>
												<span className="text-xs">{new Date(cronStatus.lastRun).toLocaleString()}</span>
											</div>
										)}
									</div>
								</div>

								<div className="space-y-2">
									<SectionLabel>Manual Cleanup</SectionLabel>
									<div className="grid grid-cols-2 gap-2">
										<ActionButton
											icon={Play}
											label="Run Cleanup"
											onClick={() => runCleanup(false)}
											loading={cleanupLoading}
											variant="default"
										/>
										<ActionButton
											icon={Clock}
											label="Dry Run"
											onClick={() => runCleanup(true)}
											loading={cleanupLoading}
											variant="default"
										/>
									</div>
								</div>

								{cronStatus.runHistory.length > 0 && (
									<div className="space-y-2">
										<SectionLabel>Run History</SectionLabel>
										<div className="bg-muted/30 border rounded-lg p-2 space-y-1 text-xs max-h-40 overflow-y-auto">
											{cronStatus.runHistory.map((run, index) => (
												<div key={index} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50">
													<div className="flex items-center gap-2">
														{run.status === 'success' ? (
															<CheckCircle className="h-3 w-3 text-emerald-500" />
														) : (
															<XCircle className="h-3 w-3 text-red-500" />
														)}
														<span>{new Date(run.timestamp).toLocaleString()}</span>
													</div>
													<span className="font-medium">{run.usersDeleted} deleted</span>
												</div>
											))}
										</div>
									</div>
								)}
							</>
						)}

						{/* Health Tab Content */}
						{activeTab === 'health' && (
							<>
								<div className="space-y-2">
									<SectionLabel>System Health</SectionLabel>
									<div className="space-y-3">
										<div className="bg-muted/30 border rounded-lg p-3">
											<div className="flex items-center justify-between">
												<span className="text-xs font-medium">Database</span>
												<div className={cn(
													'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium',
													isConnected ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
												)}>
													<div className={cn(
														'h-1.5 w-1.5 rounded-full animate-pulse',
														isConnected ? 'bg-emerald-500' : 'bg-red-500'
													)} />
													{isConnected ? 'CONNECTED' : 'DISCONNECTED'}
												</div>
											</div>
										</div>

										{provider && (
											<div className="bg-muted/30 border rounded-lg p-3">
												<div className="flex items-center justify-between">
													<span className="text-xs font-medium">Provider</span>
													<div className={cn(
														'px-2 py-1 rounded-full text-[10px] font-medium',
														provider === 'neon' ? 'bg-orange-500/10 text-orange-600' : 'bg-blue-500/10 text-blue-600'
													)}>
														{provider === 'neon' ? 'NEON' : 'POSTGRES'}
													</div>
												</div>
											</div>
										)}

										<div className="bg-muted/30 border rounded-lg p-3">
											<div className="flex items-center justify-between">
												<span className="text-xs font-medium">Cron Secret</span>
												<div className={cn(
													'px-2 py-1 rounded-full text-[10px] font-medium',
													process.env.CRON_SECRET ? 'bg-emerald-500/10 text-emerald-600' : 'bg-orange-500/10 text-orange-600'
												)}>
													{process.env.CRON_SECRET ? 'CONFIGURED' : 'NOT SET'}
												</div>
											</div>
										</div>
									</div>
								</div>

								<div className="space-y-2">
									<ActionButton
										icon={Activity}
										label="Refresh Health"
										onClick={fetchStats}
										loading={loading}
									/>
								</div>
							</>
						)}

						{/* Config Tab Content */}
						{activeTab === 'config' && (
							<>
								<div className="space-y-2">
									<SectionLabel>Cron Configuration</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-3 space-y-2 text-xs">
										<div className="flex items-center justify-between">
											<span className="font-medium">Schedule</span>
											<code className="bg-background px-1.5 py-0.5 rounded">0 2 * * *</code>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">Endpoint</span>
											<code className="bg-background px-1.5 py-0.5 rounded text-[9px]">/api/cron/cleanup</code>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">Deletion Threshold</span>
											<span>24 hours</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">Batch Size</span>
											<span>100 users</span>
										</div>
									</div>
								</div>

								<div className="space-y-2">
									<SectionLabel>Quick Actions</SectionLabel>
									<div className="grid grid-cols-2 gap-2">
										<ActionButton
											icon={Shield}
											label="Test Auth"
											onClick={() => runCleanup(true)}
											variant="default"
										/>
										<ActionButton
											icon={RefreshCw}
											label="Cron Status"
											onClick={fetchStats}
											loading={loading}
										/>
									</div>
								</div>

								<div className="space-y-2">
									<SectionLabel>Environment</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-3 space-y-2 text-xs">
										<div className="flex items-center justify-between">
											<span className="font-medium">NODE_ENV</span>
											<span className="px-1.5 py-0.5 rounded bg-background">{process.env.NODE_ENV || 'development'}</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">Widget Position</span>
											<button
												onClick={resetPosition}
												className="text-blue-600 hover:underline"
												onMouseDown={(e) => e.stopPropagation()}
											>
												Reset
											</button>
										</div>
									</div>
								</div>
							</>
						)}
					</div>

					{/* Resize Handle */}
					<div
						className="absolute bottom-0 right-0 p-1 cursor-nwse-resize hover:bg-muted transition-colors rounded-tl z-50"
						onMouseDown={(e) => {
							e.stopPropagation()
							e.preventDefault()
							setResizeStart({
								x: e.clientX,
								y: e.clientY,
								w: size.width,
								h: size.height,
							})
						}}
					>
						<Grip className="h-4 w-4 text-muted-foreground/50" />
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
