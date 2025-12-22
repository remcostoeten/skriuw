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
	RotateCcw,
	AlertTriangle,
	Server
} from 'lucide-react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { cn } from '@skriuw/shared'
import {
	downloadJsonExport,
	downloadMarkdownExport,
	importFromJson,
	importFromMarkdown
} from '@/features/backup'
import { useNotesContext } from '@/features/notes'
import { useDraggable } from '@/hooks/use-draggable'
import { useCookie } from '@/hooks/use-cookie'
import { HintPopover } from '@skriuw/ui'

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
	isAdmin?: boolean
	inSync?: boolean
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
	const [isVisible, setIsVisible] = useState(false)
	const [activeTab, setActiveTab] = useState<TabType>('database')
	const [stats, setStats] = useState<DbStats | null>(null)
	const [provider, setProvider] = useState<'neon' | 'postgres' | null>(null)
	const [loading, setLoading] = useState(false)
	const [actionLoading, setActionLoading] = useState<string | null>(null)
	const [isConnected, setIsConnected] = useState<boolean | null>(null)
	const [schemaStatus, setSchemaStatus] = useState<{
		checked: boolean
		inSync: boolean
		message?: string
	} | null>(null)
	const {
		value: hideBadgeCookie,
		updateCookie,
		deleteCookie
	} = useCookie('hide-alpha-badge')
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
	const [userActionLoading, setUserActionLoading] = useState<string | null>(
		null
	)

	// Resize state
	const [size, setSize] = useState({ width: 450, height: 500 })
	const [resizeStart, setResizeStart] = useState<{
		x: number
		y: number
		w: number
		h: number
	} | null>(null)

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

	useEffect(() => {
		function handleMouseMove(e: MouseEvent) {
			if (!resizeStart) return
			const deltaX = e.clientX - resizeStart.x
			const deltaY = e.clientY - resizeStart.y
			setSize({
				width: Math.max(320, resizeStart.w + deltaX),
				height: Math.max(300, resizeStart.h + deltaY)
			})
		}

		function handleMouseUp() {
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
	const [dragStartPos, setDragStartPos] = useState<{
		x: number
		y: number
	} | null>(null)
	const [hasMoved, setHasMoved] = useState(false)

	// Draggable functionality
	const {
		dragRef,
		position,
		isDragging,
		handleMouseDown,
		handleTouchStart,
		resetPosition
	} = useDraggable({
		initialPosition: {
			x: typeof window !== 'undefined' ? window.innerWidth - 100 : 0,
			y: typeof window !== 'undefined' ? window.innerHeight - 100 : 0
		},
		storageKey: 'dev-widget-position',
		bounds: {
			// Restrict closer to viewport edges
			left: 0,
			top: 0,
			right: 0,
			bottom: 0
		}
	})

	// Ensure widget stays in viewport on resize
	useEffect(() => {
		const handleResize = () => {
			if (position.x > window.innerWidth - 50) {
				// reset to safe position if lost
				resetPosition()
			}
		}
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [position, resetPosition])

	const fetchStats = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch('/api/dev')
			if (res.ok) {
				const data: DevApiResponse = await res.json()
				setStats(data.stats || null)
				if (data.provider) setProvider(data.provider)
				setIsConnected(true)
				// If we get a 200 OK, we are authorized (either dev or admin)
				setIsVisible(true)

				// Ping DB to be sure of connection health
				try {
					const pingRes = await fetch('/api/dev', {
						method: 'POST',
						body: JSON.stringify({ action: 'ping-db' }),
						headers: { 'Content-Type': 'application/json' }
					})
					if (!pingRes.ok) throw new Error('DB Ping failed')
				} catch (e) {
					setIsConnected(false)
				}
			} else {
				if (res.status === 403) {
					setIsVisible(false)
				}
				setIsConnected(false)
			}
		} catch (error) {
			console.error('Failed to fetch dev stats', error)
			setIsConnected(false)
		} finally {
			setLoading(false)
		}
	}, [])

	// Initial fetch to determine visibility
	useEffect(() => {
		fetchStats()
	}, [fetchStats])

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

	const resetUser = useCallback(
		async (userId: string) => {
			if (
				!confirm(
					'Reset this user? All their notes, folders, tasks, and settings will be deleted.'
				)
			)
				return

			setUserActionLoading(`reset-${userId}`)
			try {
				const res = await fetch(`/api/dev/users/${userId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'reset' })
				})
				const data = await res.json()
				if (!res.ok) throw new Error(data.error || 'Reset failed')
				toast.success(data.message)
				await fetchStats()
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : 'Reset failed'
				)
			} finally {
				setUserActionLoading(null)
			}
		},
		[fetchStats]
	)

	const deleteUser = useCallback(
		async (userId: string) => {
			if (
				!confirm(
					'Delete this user entirely? This action cannot be undone.'
				)
			)
				return

			setUserActionLoading(`delete-${userId}`)
			try {
				const res = await fetch(`/api/dev/users/${userId}`, {
					method: 'DELETE'
				})
				const data = await res.json()
				if (!res.ok) throw new Error(data.error || 'Delete failed')
				toast.success(data.message)
				await fetchUsers()
				await fetchStats()
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : 'Delete failed'
				)
			} finally {
				setUserActionLoading(null)
			}
		},
		[fetchUsers, fetchStats]
	)

	const runCleanup = useCallback(
		async (dryRun = false) => {
			setCleanupLoading(true)
			try {
				const res = await fetch('/api/cron/cleanup', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						// For development, we'll use a simple auth that can be bypassed
						Authorization: `Bearer dev-cleanup-secret`
					},
					body: JSON.stringify({ dryRun })
				})

				const data = await res.json()

				if (!res.ok) {
					throw new Error(data.error || 'Cleanup failed')
				}

				toast.success(
					data.message ||
					(dryRun ? 'Dry run completed' : 'Cleanup completed')
				)

				// Update cron status
				setCronStatus((prev) => ({
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
				const errorMsg =
					error instanceof Error ? error.message : 'Cleanup failed'
				toast.error(errorMsg)

				// Update cron status with failure
				setCronStatus((prev) => ({
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
		},
		[fetchStats, fetchUsers]
	)

	// Fetch stats when widget opens to update connection status
	useEffect(() => {
		if (isOpen) {
			fetchStats()
		}
	}, [isOpen, fetchStats])

	useEffect(() => {
		if (isOpen && activeTab === 'users') {
			fetchUsers()
		}
	}, [isOpen, activeTab, fetchUsers])

	// Track mouse movement to detect click vs drag
	useEffect(() => {

		function handleMouseMove(e: MouseEvent) {
			if (!dragStartPos) return
			const deltaX = Math.abs(e.clientX - dragStartPos.x)
			const deltaY = Math.abs(e.clientY - dragStartPos.y)
			const threshold = 5 // 5px threshold to distinguish click from drag

			if (deltaX > threshold || deltaY > threshold) {
				setHasMoved(true)
			}
		}

		function handleMouseUp() {
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

	const executeAction = useCallback(async (action: string, confirmMsg?: string) => {
		if (confirmMsg && !confirm(confirmMsg)) return
		setActionLoading(action)

		// Special handling for reset-database
		if (action === 'reset-database') {
			if (
				!confirm(
					'EXTREMELY DANGEROUS: This will drop ALL tables and lose ALL data. Type "DELETE" to confirm.'
				)
			) {
				setActionLoading(null)
				return
			}
		}

		try {
			const res = await fetch('/api/dev', {
				method: 'POST',
				body: JSON.stringify({ action }),
				headers: { 'Content-Type': 'application/json' }
			})
			const data: DevApiResponse = await res.json()

			if (!res.ok) throw new Error(data.error || 'Action failed')

			if (action === 'check-schema') {
				setSchemaStatus({
					checked: true,
					inSync: !!data.inSync,
					message: data.message
				})
			}

			toast.success(data.message || 'Action completed')

			if (data.restartRequired) {
				toast.info('Restart required. Reloading page...')
				setTimeout(() => window.location.reload(), 2000)
			} else {
				await fetchStats()
				await refreshItems()
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Action failed')
			if (action === 'check-schema') {
				setSchemaStatus({
					checked: true,
					inSync: false,
					message: err instanceof Error ? err.message : 'Check failed'
				})
			}
		} finally {
			setActionLoading(null)
		}
	}, [fetchStats, refreshItems])

	// Memoized callbacks for performance optimization
	const handleToggleWidget = useCallback(() => {
		// Only toggle if we haven't moved (i.e., it was a click, not a drag)
		if (!hasMoved && dragStartPos) {
			setIsOpen(!isOpen)
		}
	}, [hasMoved, dragStartPos, isOpen])

	const handleOpenWidget = useCallback(() => {
		// Only toggle if we haven't moved (i.e., it was a click, not a drag)
		if (!hasMoved && dragStartPos) {
			setIsOpen(true)
		}
		// Reset drag detection state
		setHasMoved(false)
		setDragStartPos(null)
	}, [hasMoved, dragStartPos])

	const handleWidgetMouseDown = useCallback((e: React.MouseEvent) => {
		// Track initial position for click vs drag detection
		setDragStartPos({ x: e.clientX, y: e.clientY })
		setHasMoved(false)
		handleMouseDown(e)
	}, [handleMouseDown])

	const handleWidgetTouchStart = useCallback((e: React.TouchEvent) => {
		// Track initial position for touch events
		const touch = e.touches[0]
		setDragStartPos({ x: touch.clientX, y: touch.clientY })
		setHasMoved(false)
		handleTouchStart(e)
	}, [handleTouchStart])

	const handleCloseWidget = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		setIsOpen(false)
	}, [])

	const handleTabChange = useCallback((tabId: TabType) => {
		setActiveTab(tabId)
	}, [])

	const handleCheckSchema = useCallback(() => {
		executeAction('check-schema')
	}, [executeAction])

	const handlePushSchema = useCallback(() => {
		executeAction('push-schema')
	}, [executeAction])

	const handleResetDatabase = useCallback(() => {
		executeAction('reset-database')
	}, [executeAction])

	const handleSeedData = useCallback(() => {
		executeAction('seed')
	}, [executeAction])

	const handleClearData = useCallback(() => {
		executeAction('clear-all', 'Clear all data? This will delete everything except users.')
	}, [executeAction])

	const handleExportJson = useCallback(() => {
		downloadJsonExport(items)
	}, [items])

	const handleExportMarkdown = useCallback(() => {
		downloadMarkdownExport(items)
	}, [items])

	const handleImport = useCallback((type: 'json' | 'md') => {
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
						Array.from(files).map(async (f) => ({
							name: f.name,
							content: await f.text()
						}))
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
					body: JSON.stringify({ items: importResult.items })
				})

				if (!res.ok) {
					const data = await res.json()
					throw new Error(data.error || 'Import failed on server')
				}

				toast.success('Import successful', { id: toastId })
				await refreshItems()
				fetchStats()
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : 'Import failed',
					{ id: toastId }
				)
			}
		}
		input.click()
	}, [refreshItems, fetchStats])

	const handleImportJson = useCallback(() => {
		handleImport('json')
	}, [handleImport])

	const handleImportMarkdown = useCallback(() => {
		handleImport('md')
	}, [handleImport])

	const handleDeleteCookie = useCallback(() => {
		if (hasHeroCookie) {
			deleteCookie()
			toast.success('Hero cookie deleted')
		}
	}, [hasHeroCookie])

	const handleClearCache = useCallback(() => {
		executeAction('clear-cache')
	}, [executeAction])

	const handleRunCleanup = useCallback((dryRun: boolean) => {
		runCleanup(dryRun)
	}, [runCleanup])

	const handleTestAuth = useCallback(() => {
		runCleanup(true)
	}, [runCleanup])

	const handleCronStatus = useCallback(() => {
		fetchStats()
	}, [fetchStats])

	const handleResetUser = useCallback((userId: string) => {
		resetUser(userId)
	}, [resetUser])

	const handleDeleteUser = useCallback((userId: string) => {
		deleteUser(userId)
	}, [deleteUser])

	const handleToggleCookieBadge = useCallback(() => {
		if (hasHeroCookie) {
			deleteCookie()
			toast.success('Hero badge is now visible')
		} else {
			updateCookie('true')
			toast.success('Hero badge is now hidden')
		}
	}, [hasHeroCookie, deleteCookie, updateCookie])

	const handleRefreshUsersClick = useCallback(() => {
		fetchUsers()
	}, [fetchUsers])

	const handleCloseButtonMouseDown = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
	}, [])

	const handleTabButtonMouseDown = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
	}, [])

	const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
	}, [])

	const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
		e.stopPropagation()
	}, [])

	const handleResetPositionButtonMouseDown = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
	}, [])

	const handleWidgetResizeStart = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		e.preventDefault()
		setResizeStart({
			x: e.clientX,
			y: e.clientY,
			w: size.width,
			h: size.height
		})
	}, [size.width, size.height])



	// Don't render anything if not visible (authorization check failed)
	if (!isVisible) return null

	return (
		<>
			{!isOpen && (
				<button
					ref={dragRef as any}
					onClick={handleOpenWidget}
					onMouseDown={handleWidgetMouseDown}
					onTouchStart={handleWidgetTouchStart}
					className={cn(
						'fixed z-50 h-10 w-10 rounded-full border border-border bg-background/80 backdrop-blur-sm text-muted-foreground shadow-lg hover:shadow-xl hover:bg-accent hover:text-accent-foreground transition-all flex items-center justify-center animate-in fade-in zoom-in duration-200',
						isDragging && 'cursor-grabbing'
					)}
					style={{
						left: position.x,
						top: position.y,
						right: 'auto',
						bottom: 'auto'
					}}
				>
					<Bug className="h-5 w-5" />
				</button>
			)}

			{isOpen && (
				<div
					ref={dragRef as any}
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
						bottom: 'auto'
					}}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
				>
					{/* Header */}
					<div className="flex items-center justify-between p-3 border-b bg-background/95 backdrop-blur-sm cursor-grab active:cursor-grabbing">
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
										isConnected
											? 'bg-emerald-500'
											: 'bg-red-500'
									)}
								/>
								{isConnected ? 'ACTIVE' : 'DOWN'}
								{!isConnected && provider === 'neon' && (
									<HintPopover hint="Neon URL is most likely wrong or database is down." />
								)}
								{!isConnected && provider !== 'neon' && (
									<HintPopover hint="Docker is not active, please start it." />
								)}
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
									<Server className="h-2 w-2" />
									{provider === 'neon' ? 'NEON' : 'DOCKER'}
								</div>
							)}
						</div>
						<button
							onClick={handleCloseWidget}
							onMouseDown={handleCloseButtonMouseDown}
							className="hover:bg-muted rounded p-1 transition-colors cursor-pointer"
						>
							<X className="h-4 w-4 text-muted-foreground" />
						</button>
					</div>

					{/* Tab Navigation */}
					<div className="flex border-b bg-muted/30 overflow-x-auto scrollbar-hide">
						{[
							{
								id: 'database' as TabType,
								icon: Database,
								label: 'Database',
								shortcut: '1'
							},
							{
								id: 'users' as TabType,
								icon: Users,
								label: 'Users',
								shortcut: '2'
							},
							{
								id: 'cron' as TabType,
								icon: Clock,
								label: 'Cron',
								shortcut: '3'
							},
							{
								id: 'health' as TabType,
								icon: Activity,
								label: 'Health',
								shortcut: '4'
							},
							{
								id: 'config' as TabType,
								icon: Settings,
								label: 'Config',
								shortcut: '5'
							}
						].map((tab) => (
							<button
								key={tab.id}
								onClick={() => handleTabChange(tab.id)}
								className={cn(
									'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap min-w-fit flex-1 justify-center relative group',
									activeTab === tab.id
										? 'border-primary text-primary bg-background/50'
										: 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
								)}
								title={`Shortcut: ${tab.shortcut}`}
								onMouseDown={handleTabButtonMouseDown}
							>
								<tab.icon className="h-3.5 w-3.5" />
								{tab.label}
								<span className="ml-1 text-[9px] opacity-50 group-hover:opacity-100 transition-opacity font-mono">
									{tab.shortcut}
								</span>
							</button>
						))}
					</div>

					<div
						className="p-3 space-y-4 text-sm flex-1 overflow-y-auto custom-scrollbar"
						onMouseDown={handleContentMouseDown}
						onTouchStart={handleContentTouchStart}
					>
						{/* Database Tab Content */}
						{activeTab === 'database' && (
							<>
								{/* Stats Grid */}
								<div className="grid grid-cols-3 gap-2">
									<StatCard
										label="Notes"
										value={stats?.notes ?? '-'}
										loading={loading}
									/>
									<StatCard
										label="Folders"
										value={stats?.folders ?? '-'}
										loading={loading}
									/>
									<StatCard
										label="Tasks"
										value={stats?.tasks ?? '-'}
										loading={loading}
									/>
								</div>

								<div className="space-y-2">
									<SectionLabel>Schema Manager</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-3 space-y-3">
										<div className="flex items-center justify-between">
											<span className="text-xs text-muted-foreground">
												Sync Status
											</span>
											{schemaStatus?.checked ? (
												<div
													className={cn(
														'flex items-center gap-1.5 text-xs font-medium',
														schemaStatus.inSync
															? 'text-emerald-600'
															: 'text-amber-600'
													)}
												>
													{schemaStatus.inSync ? (
														<CheckCircle className="h-3 w-3" />
													) : (
														<AlertTriangle className="h-3 w-3" />
													)}
													{schemaStatus.inSync
														? 'Synced'
														: 'Out of sync'}
												</div>
											) : (
												<span className="text-xs text-muted-foreground italic">
													Not checked
												</span>
											)}
										</div>

										{!schemaStatus?.inSync &&
											schemaStatus?.checked && (
												<div className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded">
													{schemaStatus.message ||
														'Database schema schema does not match code schema.'}
												</div>
											)}

										<div className="grid grid-cols-2 gap-2">
											<ActionButton
												icon={Activity}
												label="Check Sync"
												onClick={handleCheckSchema}
												loading={
													actionLoading ===
													'check-schema'
												}
											/>
											{schemaStatus?.checked &&
												!schemaStatus.inSync && (
													<ActionButton
														icon={Upload}
														label="Push Schema"
														onClick={handlePushSchema}
														loading={
															actionLoading ===
															'push-schema'
														}
													/>
												)}
											<ActionButton
												icon={RotateCcw}
												label="Reset DB"
												variant="destructive"
												onClick={handleResetDatabase}
												loading={
													actionLoading ===
													'reset-database'
												}
											/>
										</div>
									</div>
								</div>

								{/* Actions Section */}
								<div className="space-y-2">
									<SectionLabel>Data Management</SectionLabel>
									<div className="grid grid-cols-2 gap-2">
										<ActionButton
											icon={Sprout}
											label="Seed Data"
											onClick={handleSeedData}
											loading={actionLoading === 'seed'}
										/>
										<ActionButton
											icon={Trash2}
											label="Clear Data"
											variant="destructive"
											onClick={handleClearData}
											loading={
												actionLoading === 'clear-all'
											}
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
												onClick={handleExportJson}
											/>
											<ActionButton
												icon={Download}
												label="Export MD"
												onClick={handleExportMarkdown}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<ActionButton
												icon={Upload}
												label="Import JSON"
												onClick={handleImportJson}
											/>
											<ActionButton
												icon={Upload}
												label="Import MD"
												onClick={handleImportMarkdown}
											/>
										</div>
									</div>
								</div>

								<div className="space-y-2">
									<SectionLabel>Cookies</SectionLabel>
									<ActionButton
										icon={Cookie}
										label={
											hasHeroCookie
												? 'Show Hero Badge'
												: 'Hide Hero Badge'
										}
										fullWidth
										onClick={handleToggleCookieBadge}
									/>
								</div>

								<div className="space-y-2">
									<SectionLabel>System</SectionLabel>
									<div className="grid grid-cols-2 gap-2">
										<ActionButton
											icon={RefreshCw}
											label="Clear Cache"
											onClick={handleClearCache}
											loading={
												actionLoading === 'clear-cache'
											}
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
										<StatCard
											label="Total Users"
											value={stats?.users ?? '-'}
											loading={loading}
										/>
										<StatCard
											label="Anonymous"
											value={stats?.anonymousUsers ?? '-'}
											loading={loading}
										/>
									</div>
									<StatCard
										label="Pending Deletion"
										value={stats?.anonymousUsersOld ?? '-'}
										loading={loading}
									/>
								</div>

								<div className="space-y-2">
									<SectionLabel>User Management</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-2 space-y-1 text-xs max-h-60 overflow-y-auto">
										{usersLoading ? (
											<div className="flex items-center justify-center py-4">
												<Loader2 className="h-4 w-4 animate-spin" />
											</div>
										) : users.length === 0 ? (
											<div className="text-muted-foreground text-center py-4">
												No users found
											</div>
										) : (
											users.map((user) => (
												<div
													key={user.id}
													className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50 group"
												>
													<div className="flex items-center gap-2 flex-1 min-w-0">
														{user.isAnonymous ? (
															<div className="h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" />
														) : (
															<div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
														)}
														<div className="font-mono text-[10px] flex-shrink-0">
															{user.id.slice(-8)}
														</div>
														{user.email && (
															<div className="text-muted-foreground truncate text-[10px]">
																{user.email}
															</div>
														)}
													</div>
													<div className="flex items-center gap-1">
														<div className="text-right mr-2">
															<div className="text-[10px] text-muted-foreground">
																{new Date(
																	user.createdAt
																).toLocaleDateString()}
															</div>
															<div className="text-[9px] text-muted-foreground">
																{new Date(
																	user.createdAt
																).toLocaleTimeString()}
															</div>
														</div>
														<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
															<button
																onClick={() =>
																	handleResetUser(
																		user.id
																	)
																}
																disabled={
																	userActionLoading ===
																	`reset-${user.id}`
																}
																className="p-1 rounded hover:bg-orange-500/20 text-orange-600 disabled:opacity-50"
																title="Reset user data"
															>
																{userActionLoading ===
																	`reset-${user.id}` ? (
																	<Loader2 className="h-3 w-3 animate-spin" />
																) : (
																	<RotateCcw className="h-3 w-3" />
																)}
															</button>
															<button
																onClick={() =>
																	handleDeleteUser(
																		user.id
																	)
																}
																disabled={
																	userActionLoading ===
																	`delete-${user.id}`
																}
																className="p-1 rounded hover:bg-red-500/20 text-red-600 disabled:opacity-50"
																title="Delete user"
															>
																{userActionLoading ===
																	`delete-${user.id}` ? (
																	<Loader2 className="h-3 w-3 animate-spin" />
																) : (
																	<Trash2 className="h-3 w-3" />
																)}
															</button>
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
										onClick={handleRefreshUsersClick}
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
											<span className="text-xs font-medium">
												Status
											</span>
											<div
												className={cn(
													'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium',
													cronStatus.status ===
														'success'
														? 'bg-emerald-500/10 text-emerald-600'
														: cronStatus.status ===
															'failed'
															? 'bg-red-500/10 text-red-600'
															: 'bg-gray-500/10 text-gray-600'
												)}
											>
												{cronStatus.status ===
													'success' && (
														<CheckCircle className="h-3 w-3" />
													)}
												{cronStatus.status ===
													'failed' && (
														<XCircle className="h-3 w-3" />
													)}
												{cronStatus.status ===
													'never' && (
														<Clock className="h-3 w-3" />
													)}
												{cronStatus.status.toUpperCase()}
											</div>
										</div>

										<div className="flex items-center justify-between">
											<span className="text-xs font-medium">
												Total Deleted
											</span>
											<span className="text-xs font-bold">
												{cronStatus.totalDeleted}
											</span>
										</div>

										{cronStatus.lastRun && (
											<div className="flex items-center justify-between">
												<span className="text-xs font-medium">
													Last Run
												</span>
												<span className="text-xs">
													{new Date(
														cronStatus.lastRun
													).toLocaleString()}
												</span>
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
											onClick={() => handleRunCleanup(false)}
											loading={cleanupLoading}
											variant="default"
										/>
										<ActionButton
											icon={Clock}
											label="Dry Run"
											onClick={() => handleRunCleanup(true)}
											loading={cleanupLoading}
											variant="default"
										/>
									</div>
								</div>

								{cronStatus.runHistory.length > 0 && (
									<div className="space-y-2">
										<SectionLabel>Run History</SectionLabel>
										<div className="bg-muted/30 border rounded-lg p-2 space-y-1 text-xs max-h-40 overflow-y-auto">
											{cronStatus.runHistory.map(
												(run, index) => (
													<div
														key={index}
														className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50"
													>
														<div className="flex items-center gap-2">
															{run.status ===
																'success' ? (
																<CheckCircle className="h-3 w-3 text-emerald-500" />
															) : (
																<XCircle className="h-3 w-3 text-red-500" />
															)}
															<span>
																{new Date(
																	run.timestamp
																).toLocaleString()}
															</span>
														</div>
														<span className="font-medium">
															{run.usersDeleted}{' '}
															deleted
														</span>
													</div>
												)
											)}
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
												<span className="text-xs font-medium">
													Database
												</span>
												<div
													className={cn(
														'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium',
														isConnected
															? 'bg-emerald-500/10 text-emerald-600'
															: 'bg-red-500/10 text-red-600'
													)}
												>
													<div
														className={cn(
															'h-1.5 w-1.5 rounded-full animate-pulse',
															isConnected
																? 'bg-emerald-500'
																: 'bg-red-500'
														)}
													/>
													{isConnected
														? 'CONNECTED'
														: 'DISCONNECTED'}
												</div>
											</div>
										</div>

										{provider && (
											<div className="bg-muted/30 border rounded-lg p-3">
												<div className="flex items-center justify-between">
													<span className="text-xs font-medium">
														Provider
													</span>
													<div
														className={cn(
															'px-2 py-1 rounded-full text-[10px] font-medium',
															provider === 'neon'
																? 'bg-orange-500/10 text-orange-600'
																: 'bg-blue-500/10 text-blue-600'
														)}
													>
														{provider === 'neon'
															? 'NEON'
															: 'POSTGRES'}
													</div>
												</div>
											</div>
										)}

										<div className="bg-muted/30 border rounded-lg p-3">
											<div className="flex items-center justify-between">
												<span className="text-xs font-medium">
													Cron Secret
												</span>
												<div
													className={cn(
														'px-2 py-1 rounded-full text-[10px] font-medium',
														process.env.CRON_SECRET
															? 'bg-emerald-500/10 text-emerald-600'
															: 'bg-orange-500/10 text-orange-600'
													)}
												>
													{process.env.CRON_SECRET
														? 'CONFIGURED'
														: 'NOT SET'}
												</div>
											</div>
										</div>
									</div>
								</div>

								<div className="space-y-2">
									<ActionButton
										icon={Activity}
										label="Refresh Health"
										onClick={() => fetchStats()}
										loading={loading}
									/>
								</div>
							</>
						)}

						{/* Config Tab Content */}
						{activeTab === 'config' && (
							<>
								<div className="space-y-2">
									<SectionLabel>
										Cron Configuration
									</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-3 space-y-2 text-xs">
										<div className="flex items-center justify-between">
											<span className="font-medium">
												Schedule
											</span>
											<code className="bg-background px-1.5 py-0.5 rounded">
												0 2 * * *
											</code>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												Endpoint
											</span>
											<code className="bg-background px-1.5 py-0.5 rounded text-[9px]">
												/api/cron/cleanup
											</code>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												Deletion Threshold
											</span>
											<span>24 hours</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												Batch Size
											</span>
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
											onClick={() => handleTestAuth()}
											variant="default"
										/>
										<ActionButton
											icon={RefreshCw}
											label="Cron Status"
											onClick={() => handleCronStatus()}
											loading={loading}
										/>
									</div>
								</div>

								<div className="space-y-2">
									<SectionLabel>Environment</SectionLabel>
									<div className="bg-muted/30 border rounded-lg p-3 space-y-2 text-xs">
										<div className="flex items-center justify-between">
											<span className="font-medium">
												NODE_ENV
											</span>
											<span className="px-1.5 py-0.5 rounded bg-background">
												{process.env.NODE_ENV ||
													'development'}
											</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												Widget Position
											</span>
											<button
												onClick={resetPosition}
												className="text-blue-600 hover:underline"
												onMouseDown={handleResetPositionButtonMouseDown}
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
						onMouseDown={handleWidgetResizeStart}
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
	loading
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
				{loading ? (
					<Loader2 className="h-4 w-4 animate-spin mx-auto my-1" />
				) : (
					value
				)}
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
	fullWidth
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
