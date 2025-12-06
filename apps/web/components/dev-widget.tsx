'use client'

import {
	Activity,
	Database,
	Route as RouteIcon,
	X,
	Trash2,
	Download,
	Upload,
	FileJson,
	FileText,
	Clock,
	Package,
	Bug,
	Settings,
	Copy,
	Keyboard,
	Layers,
	ToggleLeft,
	RefreshCw,
	HardDrive,
	Loader2,
	Sprout,
	AlertTriangle,
	Cpu
} from 'lucide-react'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { cn } from '@skriuw/core-logic'
import { downloadJsonExport, downloadMarkdownExport } from '@/features/backup'
import { importFromJson, importFromMarkdown } from '@/features/backup'
import { useEditorTabs } from '../features/editor/tabs'
import { useUIStore } from '../stores/ui-store'
import { shortcutDefinitions, type ShortcutId } from '../features/shortcuts/shortcut-definitions'
import { useNotesContext } from '@/features/notes'

type HealthInfo = {
	status: string
	timestamp: string
	environment: {
		nodeEnv?: string
		hasDatabaseUrl?: boolean
		databaseUrlPreview?: string
		dbModuleAvailable?: boolean
		dbModuleError?: string | null
	}
}

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
	created?: { notes: number; folders: number }
	deleted?: { notes?: number; folders?: number; settings?: number; shortcuts?: number } | number
	restartRequired?: boolean
}

type TabId = 'status' | 'state' | 'shortcuts' | 'data' | 'tools'

export function DevWidget() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const { items, createNote, createFolder, deleteItem, isInitialLoading, isRefreshing, refreshItems } = useNotesContext()
	const { tabs: editorTabs, activeNoteId } = useEditorTabs()
	const uiStore = useUIStore()

	const [isOpen, setIsOpen] = useState(false)
	const [health, setHealth] = useState<HealthInfo | null>(null)
	const [dbStats, setDbStats] = useState<DbStats | null>(null)
	const [loading, setLoading] = useState(false)
	const [actionLoading, setActionLoading] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<TabId>('status')
	const [renderCount, setRenderCount] = useState(0)

	// Track render count
	useEffect(() => {
		setRenderCount(c => c + 1)
	}, [])

	// Calculate localStorage usage
	const localStorageInfo = useMemo(() => {
		if (typeof window === 'undefined') return null
		try {
			const keys = Object.keys(localStorage)
			const totalSize = keys.reduce((acc, key) => {
				return acc + (localStorage.getItem(key)?.length || 0)
			}, 0)
			return {
				keys: keys.filter(k => k.startsWith('skriuw') || k.includes('ui-storage')),
				totalSize: Math.round(totalSize / 1024),
				count: keys.length
			}
		} catch {
			return null
		}
	}, [isOpen])

	// Count notes vs folders
	const itemStats = useMemo(() => {
		const countRecursive = (items: any[]): { notes: number; folders: number } => {
			return items.reduce((acc, item) => {
				if (item.type === 'folder') {
					acc.folders++
					if (item.children) {
						const childStats = countRecursive(item.children)
						acc.notes += childStats.notes
						acc.folders += childStats.folders
					}
				} else {
					acc.notes++
				}
				return acc
			}, { notes: 0, folders: 0 })
		}
		return countRecursive(items)
	}, [items])

	const fetchHealth = async () => {
		setLoading(true)
		setError(null)
		try {
			const response = await fetch('/api/health')
			if (!response.ok) throw new Error(`Request failed with ${response.status}`)
			const body = (await response.json()) as HealthInfo
			setHealth(body)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}

	const fetchDbStats = async () => {
		try {
			const response = await fetch('/api/dev')
			if (!response.ok) return
			const data = await response.json()
			if (data.stats) setDbStats(data.stats)
		} catch (err) {
			console.error('Failed to fetch DB stats:', err)
		}
	}

	useEffect(() => {
		if (isOpen && !health && !loading) {
			fetchHealth()
			fetchDbStats()
		}
	}, [isOpen, health, loading])

	// Dev API actions
	const executeDevAction = useCallback(async (action: string, confirmMessage?: string) => {
		if (confirmMessage && !confirm(confirmMessage)) return

		setActionLoading(action)
		try {
			const response = await fetch('/api/dev', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			})
			const data = await response.json() as DevApiResponse

			if (!response.ok) {
				throw new Error(data.error || 'Action failed')
			}

			toast.success(data.message || `${action} completed`)

			// Handle restart required actions
			if (data.restartRequired) {
				toast.info('Reloading page in 3 seconds...')
				setTimeout(() => {
					window.location.reload()
				}, 3000)
				return
			}

			// Refresh data after action
			await fetchDbStats()
			await refreshItems()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Action failed')
		} finally {
			setActionLoading(null)
		}
	}, [refreshItems])

	const handleExportJson = () => {
		try {
			downloadJsonExport(items)
			toast.success('Exported as JSON')
		} catch (err) {
			toast.error('Export failed')
		}
	}

	const handleExportMarkdown = () => {
		try {
			downloadMarkdownExport(items)
			toast.success('Exported as Markdown')
		} catch (err) {
			toast.error('Export failed')
		}
	}

	const handleImportJson = async () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return
			try {
				const text = await file.text()
				await importFromJson(text)
				toast.success('Imported from JSON')
				await refreshItems()
			} catch (err) {
				toast.error('Import failed')
			}
		}
		input.click()
	}

	const handleImportMarkdown = async () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.md'
		input.multiple = true
		input.onchange = async (e) => {
			const files = (e.target as HTMLInputElement).files
			if (!files) return
			try {
				const fileContents = await Promise.all(
					Array.from(files).map(async (file) => ({
						name: file.name,
						content: await file.text(),
					}))
				)
				await importFromMarkdown(fileContents)
				toast.success(`Imported ${files.length} markdown files`)
				await refreshItems()
			} catch (err) {
				toast.error('Import failed')
			}
		}
		input.click()
	}

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text)
		toast.success('Copied to clipboard')
	}

	const isDev = health?.environment.nodeEnv === 'development'

	const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
		{ id: 'status', label: 'Status', icon: <Activity className="h-3 w-3" /> },
		{ id: 'state', label: 'State', icon: <Layers className="h-3 w-3" /> },
		{ id: 'shortcuts', label: 'Keys', icon: <Keyboard className="h-3 w-3" /> },
		{ id: 'data', label: 'Data', icon: <Database className="h-3 w-3" /> },
		{ id: 'tools', label: 'Tools', icon: <Settings className="h-3 w-3" /> },
	]

	if (!isOpen) {
		return (
			<button
				onClick={() => setIsOpen(true)}
				className={cn(
					'fixed bottom-4 right-4 z-50',
					'w-12 h-12 rounded-full',
					'bg-primary text-primary-foreground',
					'flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-border'
				)}
				title="Open Dev Widget"
			>
				<Bug className="h-5 w-5" />
			</button>
		)
	}

	return (
		<div
			className={cn(
				'fixed bottom-4 right-4 z-50',
				'w-[400px] max-w-[90vw] rounded-xl border border-border bg-background/95 backdrop-blur shadow-xl',
				'flex flex-col'
			)}
		>
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
				<div className="flex items-center gap-2">
					<Bug className="h-4 w-4 text-primary" />
					<div className="text-sm font-semibold text-foreground">Dev Tools</div>
					{isDev && (
						<span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-500 rounded font-medium">
							DEV
						</span>
					)}
				</div>
				<button
					onClick={() => setIsOpen(false)}
					className="w-6 h-6 grid place-items-center rounded-md hover:bg-muted transition-colors"
					aria-label="Close dev widget"
				>
					<X className="h-4 w-4 text-muted-foreground" />
				</button>
			</div>

			{/* Tabs */}
			<div className="flex border-b border-border/60 overflow-x-auto">
				{tabs.map(tab => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							'flex-shrink-0 px-2.5 py-2 text-xs font-medium transition-colors flex items-center gap-1',
							activeTab === tab.id
								? 'text-foreground border-b-2 border-primary'
								: 'text-muted-foreground hover:text-foreground'
						)}
					>
						{tab.icon}
						{tab.label}
					</button>
				))}
			</div>

			{/* Content */}
			<div className="p-4 space-y-4 max-h-[450px] overflow-y-auto">
				{/* STATUS TAB */}
				{activeTab === 'status' && (
					<>
						<section className="space-y-1.5">
							<SectionHeader icon={<RouteIcon className="h-3.5 w-3.5" />} title="Route" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
								<div
									className="text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
									onClick={() => copyToClipboard(pathname || '/')}
									title="Click to copy"
								>
									{pathname || '/'}
								</div>
								{searchParams.size > 0 && (
									<div
										className="text-xs text-muted-foreground mt-1 break-all cursor-pointer hover:text-primary transition-colors"
										onClick={() => copyToClipboard('?' + searchParams.toString())}
										title="Click to copy"
									>
										?{searchParams.toString()}
									</div>
								)}
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Database className="h-3.5 w-3.5" />} title="Backend" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								{loading && <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Checking API health…</div>}
								{error && <div className="text-destructive">Failed: {error}</div>}
								{health && !loading && (
									<>
										<InfoRow label="Status" value={health.status} valueClass={health.status === 'ok' ? 'text-emerald-500' : 'text-destructive'} />
										<InfoRow label="Environment" value={health.environment.nodeEnv || 'unknown'} />
										<InfoRow label="DB URL" value={health.environment.hasDatabaseUrl ? 'set' : 'not set'} />
										<InfoRow label="DB Module" value={health.environment.dbModuleAvailable ? 'loaded' : 'unavailable'} valueClass={health.environment.dbModuleAvailable ? 'text-emerald-500' : 'text-destructive'} />
										<button onClick={fetchHealth} className="w-full text-xs text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline">
											Refresh status
										</button>
									</>
								)}
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<HardDrive className="h-3.5 w-3.5" />} title="Database Stats" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								{dbStats ? (
									<>
										<InfoRow label="Notes" value={String(dbStats.notes)} />
										<InfoRow label="Folders" value={String(dbStats.folders)} />
										<InfoRow label="Tasks" value={String(dbStats.tasks)} />
										<InfoRow label="Settings" value={String(dbStats.settings)} />
										<InfoRow label="Shortcuts" value={String(dbStats.shortcuts)} />
									</>
								) : (
									<div className="text-xs text-muted-foreground">Loading stats…</div>
								)}
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Package className="h-3.5 w-3.5" />} title="LocalStorage" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								{localStorageInfo ? (
									<>
										<InfoRow label="Total keys" value={String(localStorageInfo.count)} />
										<InfoRow label="App keys" value={String(localStorageInfo.keys.length)} />
										<InfoRow label="Size" value={`~${localStorageInfo.totalSize}KB`} />
									</>
								) : (
									<div className="text-xs text-muted-foreground">N/A</div>
								)}
							</div>
						</section>
					</>
				)}

				{/* STATE TAB */}
				{activeTab === 'state' && (
					<>
						<section className="space-y-1.5">
							<SectionHeader icon={<Database className="h-3.5 w-3.5" />} title="Notes Context" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								<InfoRow label="Notes" value={String(itemStats.notes)} />
								<InfoRow label="Folders" value={String(itemStats.folders)} />
								<InfoRow label="Loading" value={isInitialLoading ? 'yes' : 'no'} valueClass={isInitialLoading ? 'text-amber-500' : 'text-emerald-500'} />
								<InfoRow label="Refreshing" value={isRefreshing ? 'yes' : 'no'} valueClass={isRefreshing ? 'text-amber-500' : 'text-muted-foreground'} />
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Layers className="h-3.5 w-3.5" />} title="Editor Tabs" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								<InfoRow label="Open tabs" value={String(editorTabs.length)} />
								<InfoRow label="Active" value={editorTabs.find(t => t.noteId === activeNoteId)?.title || 'None'} truncate />
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<ToggleLeft className="h-3.5 w-3.5" />} title="UI State" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								<InfoRow label="Sidebar" value={uiStore.isDesktopSidebarOpen ? 'open' : 'closed'} valueClass={uiStore.isDesktopSidebarOpen ? 'text-emerald-500' : 'text-muted-foreground'} />
								<InfoRow label="Settings" value={uiStore.isSettingsOpen ? 'open' : 'closed'} />
								<InfoRow label="Shortcuts" value={uiStore.isShortcutsSidebarOpen ? 'open' : 'closed'} />
								<InfoRow label="Renders" value={String(renderCount)} />
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Cpu className="h-3.5 w-3.5" />} title="Performance" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								<InfoRow label="Memory" value={typeof window !== 'undefined' && (performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)}MB` : 'N/A'} />
								<InfoRow label="Uptime" value={typeof window !== 'undefined' ? `${Math.round(performance.now() / 1000)}s` : 'N/A'} />
							</div>
						</section>
					</>
				)}

				{/* SHORTCUTS TAB */}
				{activeTab === 'shortcuts' && (
					<section className="space-y-1.5">
						<SectionHeader icon={<Keyboard className="h-3.5 w-3.5" />} title="Registered Shortcuts" />
						<div className="space-y-1 max-h-[350px] overflow-y-auto">
							{(Object.entries(shortcutDefinitions) as [ShortcutId, typeof shortcutDefinitions[ShortcutId]][]).map(([id, def]) => (
								<div
									key={id}
									className={cn(
										"flex items-center justify-between px-2 py-1.5 rounded text-xs",
										"border border-border/50 bg-muted/10",
										def.enabled === false && "opacity-50"
									)}
								>
									<div className="flex-1 min-w-0">
										<div className="font-medium truncate">{id}</div>
										<div className="text-muted-foreground text-[10px] truncate">{def.description}</div>
									</div>
									<div className="flex items-center gap-1 ml-2">
										{def.keys[0]?.map((key, i) => (
											<kbd key={i} className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">{key}</kbd>
										))}
										{def.enabled === false && <span className="text-destructive text-[10px]">off</span>}
									</div>
								</div>
							))}
						</div>
					</section>
				)}

				{/* DATA TAB */}
				{activeTab === 'data' && (
					<>
						{isDev && (
							<section className="space-y-1.5">
								<SectionHeader icon={<Sprout className="h-3.5 w-3.5" />} title="Database Actions" />
								<div className="space-y-2">
									<button
										onClick={() => executeDevAction('seed')}
										disabled={actionLoading !== null}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-lg border border-emerald-500/30 transition-colors disabled:opacity-50"
									>
										{actionLoading === 'seed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
										Seed Sample Data
									</button>
									<button
										onClick={() => executeDevAction('clear-notes', '⚠️ Delete ALL notes and folders from database?')}
										disabled={actionLoading !== null}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg border border-destructive/30 transition-colors disabled:opacity-50"
									>
										{actionLoading === 'clear-notes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
										Clear Notes & Folders
									</button>
									<button
										onClick={() => executeDevAction('clear-all', '⚠️ Delete ALL data from database (notes, folders, settings, shortcuts)?')}
										disabled={actionLoading !== null}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg border border-destructive/30 transition-colors disabled:opacity-50"
									>
										{actionLoading === 'clear-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
										Clear ALL Database
									</button>
								</div>
							</section>
						)}

						{!isDev && (
							<div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 border border-border/50">
								<AlertTriangle className="h-4 w-4 inline mr-1 text-amber-500" />
								Database actions are only available in development mode.
							</div>
						)}

						<section className="space-y-1.5">
							<SectionHeader icon={<Download className="h-3.5 w-3.5" />} title="Export Data" />
							<div className="space-y-2">
								<button onClick={handleExportJson} className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/20 hover:bg-muted/30 rounded-lg border border-border/70 transition-colors">
									<FileJson className="h-4 w-4" />Export as JSON
								</button>
								<button onClick={handleExportMarkdown} className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/20 hover:bg-muted/30 rounded-lg border border-border/70 transition-colors">
									<FileText className="h-4 w-4" />Export as Markdown
								</button>
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Upload className="h-3.5 w-3.5" />} title="Import Data" />
							<div className="space-y-2">
								<button onClick={handleImportJson} className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/20 hover:bg-muted/30 rounded-lg border border-border/70 transition-colors">
									<FileJson className="h-4 w-4" />Import from JSON
								</button>
								<button onClick={handleImportMarkdown} className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/20 hover:bg-muted/30 rounded-lg border border-border/70 transition-colors">
									<FileText className="h-4 w-4" />Import Markdown
								</button>
							</div>
						</section>
					</>
				)}

				{/* TOOLS TAB */}
				{activeTab === 'tools' && (
					<>
						<section className="space-y-1.5">
							<SectionHeader icon={<ToggleLeft className="h-3.5 w-3.5" />} title="Quick Toggles" />
							<div className="grid grid-cols-2 gap-2">
								<button
									onClick={() => uiStore.toggleDesktopSidebar()}
									className={cn(
										"text-xs px-2 py-1.5 rounded border transition-colors",
										uiStore.isDesktopSidebarOpen
											? "bg-primary/10 border-primary/30 text-primary"
											: "bg-muted/20 border-border/70"
									)}
								>
									Sidebar
								</button>
								<button
									onClick={() => uiStore.toggleSettings()}
									className={cn(
										"text-xs px-2 py-1.5 rounded border transition-colors",
										uiStore.isSettingsOpen
											? "bg-primary/10 border-primary/30 text-primary"
											: "bg-muted/20 border-border/70"
									)}
								>
									Settings
								</button>
								<button
									onClick={() => uiStore.toggleShortcutsSidebar()}
									className={cn(
										"text-xs px-2 py-1.5 rounded border transition-colors",
										uiStore.isShortcutsSidebarOpen
											? "bg-primary/10 border-primary/30 text-primary"
											: "bg-muted/20 border-border/70"
									)}
								>
									Shortcuts
								</button>
								<button
									onClick={() => refreshItems()}
									className="text-xs px-2 py-1.5 rounded border bg-muted/20 border-border/70 flex items-center justify-center gap-1"
								>
									<RefreshCw className="h-3 w-3" />Refresh
								</button>
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Trash2 className="h-3.5 w-3.5" />} title="Clear LocalStorage" />
							<div className="space-y-2">
								<button
									onClick={() => {
										localStorage.removeItem('skriuw_editor_tabs_state')
										toast.success('Cleared editor tabs')
										window.location.reload()
									}}
									className="w-full text-xs px-3 py-2 bg-muted/20 hover:bg-muted/30 rounded-lg border border-border/70 transition-colors text-left"
								>
									Clear editor tabs
								</button>
								<button
									onClick={() => {
										localStorage.removeItem('ui-storage')
										toast.success('Cleared UI state')
										window.location.reload()
									}}
									className="w-full text-xs px-3 py-2 bg-muted/20 hover:bg-muted/30 rounded-lg border border-border/70 transition-colors text-left"
								>
									Clear UI state
								</button>
								<button
									onClick={() => {
										if (confirm('Clear ALL localStorage data? This will reset all local settings.')) {
											localStorage.clear()
											toast.success('Cleared all localStorage')
											window.location.reload()
										}
									}}
									className="w-full text-xs px-3 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg border border-destructive/30 transition-colors text-left"
								>
									Clear ALL localStorage
								</button>
							</div>
						</section>

						{isDev && (
							<section className="space-y-1.5">
								<SectionHeader icon={<RefreshCw className="h-3.5 w-3.5" />} title="Cache & Server" />
								<div className="space-y-2">
									<button
										onClick={() => executeDevAction('clear-cache', '⚠️ Clear Next.js cache and restart dev server?')}
										disabled={actionLoading !== null}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-lg border border-amber-500/30 transition-colors disabled:opacity-50 text-left"
									>
										{actionLoading === 'clear-cache' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
										Clear Next.js Cache
									</button>
									<button
										onClick={() => executeDevAction('restart-server', '⚠️ Restart the dev server?')}
										disabled={actionLoading !== null}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg border border-blue-500/30 transition-colors disabled:opacity-50 text-left"
									>
										{actionLoading === 'restart-server' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
										Restart Dev Server
									</button>
								</div>
							</section>
						)}

						<section className="space-y-1.5">
							<SectionHeader icon={<Clock className="h-3.5 w-3.5" />} title="Timestamps" />
							<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
								<InfoRow label="Health check" value={health ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'} />
								<InfoRow label="Build time" value={process.env.NEXT_PUBLIC_BUILD_TIME || 'Unknown'} />
								<InfoRow label="Git commit" value={process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'Unknown'} />
							</div>
						</section>

						<section className="space-y-1.5">
							<SectionHeader icon={<Copy className="h-3.5 w-3.5" />} title="Copy Debug Info" />
							<button
								onClick={() => {
									const fullDebug = {
										route: pathname + (searchParams.size > 0 ? '?' + searchParams.toString() : ''),
										notes: itemStats,
										dbStats,
										editorTabs: { count: editorTabs.length, activeNoteId },
										ui: {
											sidebarOpen: uiStore.isDesktopSidebarOpen,
											settingsOpen: uiStore.isSettingsOpen,
											shortcutsOpen: uiStore.isShortcutsSidebarOpen,
										},
										localStorage: localStorageInfo,
										health,
										timestamp: new Date().toISOString()
									}
									navigator.clipboard.writeText(JSON.stringify(fullDebug, null, 2))
									toast.success('Full debug info copied')
								}}
								className="w-full text-xs px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg border border-primary/30 transition-colors text-left font-medium"
							>
								Copy full debug snapshot
							</button>
						</section>
					</>
				)}
			</div>
		</div>
	)
}

// Helper components
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
	return (
		<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			{icon}
			{title}
		</div>
	)
}

function InfoRow({ label, value, valueClass, truncate }: { label: string; value: string; valueClass?: string; truncate?: boolean }) {
	return (
		<div className="flex items-center justify-between text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className={cn("font-medium", truncate && "truncate max-w-[150px]", valueClass)}>{value}</span>
		</div>
	)
}
