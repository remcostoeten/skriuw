'use client'

import { CronTab } from './dev/cron-tab'
import { DatabaseTab } from './dev/database-tab'
import { HealthTab } from './dev/health-tab'
import { SeedingTab } from './dev/seeding-tab'
import { UsersTab } from './dev/users-tab'
import { useNotesContext } from '@/features/notes'
import { useDraggable } from '@/hooks/use-draggable'
import { cn } from '@skriuw/shared'
import { HintPopover } from '@skriuw/ui'
import {
	Database,
	Bug,
	GripVertical,
	Users,
	Clock,
	Activity,
	Sprout,
	X,
	Server,
	Grip
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

// Modular Components
type TabType = 'database' | 'users' | 'cron' | 'health' | 'seeding'

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
	stats?: DbStats
	provider?: 'neon' | 'postgres'
}

export function DevWidget() {
	const { refreshItems } = useNotesContext()
	const [isOpen, setIsOpen] = useState(false)
	const [isVisible, setIsVisible] = useState(false)
	const [activeTab, setActiveTab] = useState<TabType>('database')
	const [stats, setStats] = useState<DbStats | null>(null)
	const [provider, setProvider] = useState<'neon' | 'postgres' | null>(null)
	const [loading, setLoading] = useState(false)
	const [isConnected, setIsConnected] = useState<boolean | null>(null)

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

	// Save size on change
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
				height: Math.max(300, resizeStart.h + deltaY)
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
	const [dragStartPos, setDragStartPos] = useState<{
		x: number
		y: number
	} | null>(null)
	const [hasMoved, setHasMoved] = useState(false)

	const { dragRef, position, isDragging, handleMouseDown, handleTouchStart, resetPosition } =
		useDraggable({
			initialPosition: {
				x: typeof window !== 'undefined' ? window.innerWidth - 470 : 0,
				y: typeof window !== 'undefined' ? window.innerHeight - 520 : 0
			},
			storageKey: 'dev-widget-position',
			bounds: {
				left: 0,
				top: 0,
				right: typeof window !== 'undefined' ? window.innerWidth : 1000,
				bottom: typeof window !== 'undefined' ? window.innerHeight : 1000
			}
		})

	const fetchStats = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch('/api/dev')
			if (res.ok) {
				const data: DevApiResponse = await res.json()
				setStats(data.stats || null)
				if (data.provider) setProvider(data.provider)
				setIsConnected(true)
				setIsVisible(true)

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
				if (res.status === 403) setIsVisible(false)
				setIsConnected(false)
			}
		} catch (error) {
			console.error('Failed to fetch dev stats', error)
			setIsConnected(false)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchStats()
	}, [fetchStats])

	useEffect(() => {
		if (isOpen) fetchStats()
	}, [isOpen, fetchStats])

	// Track mouse movement
	useEffect(() => {
		if (!dragStartPos) return

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = Math.abs(e.clientX - dragStartPos.x)
			const deltaY = Math.abs(e.clientY - dragStartPos.y)
			if (deltaX > 5 || deltaY > 5) setHasMoved(true)
		}

		const handleMouseUp = () => {
			setTimeout(() => {
				setDragStartPos(null)
				setHasMoved(false)
			}, 100)
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [dragStartPos])

	if (!isVisible) return null

	return (
		<>
			{!isOpen && (
				<button
					ref={dragRef as any}
					onClick={() => {
						if (!hasMoved && dragStartPos) setIsOpen(true)
						setHasMoved(false)
						setDragStartPos(null)
					}}
					onMouseDown={(e) => {
						setDragStartPos({ x: e.clientX, y: e.clientY })
						setHasMoved(false)
						handleMouseDown(e)
					}}
					onTouchStart={(e) => {
						const touch = e.touches[0]
						setDragStartPos({ x: touch.clientX, y: touch.clientY })
						setHasMoved(false)
						handleTouchStart(e)
					}}
					className={cn(
						'fixed z-50 h-10 w-10 rounded-full border border-border bg-background/80 backdrop-blur-sm text-muted-foreground shadow-lg hover:shadow-xl hover:bg-accent hover:text-accent-foreground transition-all flex items-center justify-center animate-in fade-in zoom-in duration-200',
						isDragging && 'cursor-grabbing'
					)}
					style={{ left: position.x, top: position.y }}
				>
					<Bug className='h-5 w-5' />
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
						height: size.height
					}}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
				>
					{/* Header */}
					<div className='flex items-center justify-between p-3 border-b bg-background/95 backdrop-blur-sm cursor-grab active:cursor-grabbing'>
						<div className='flex items-center gap-2'>
							<GripVertical className='h-4 w-4 text-muted-foreground' />
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
								{isConnected ? 'ACTIVE' : 'DOWN'}
								{!isConnected && (
									<HintPopover
										hint={
											provider === 'neon'
												? 'Neon URL wrong/DB down'
												: 'Docker not active'
										}
									/>
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
									<Server className='h-2 w-2' />
									{provider === 'neon' ? 'NEON' : 'DOCKER'}
								</div>
							)}
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation()
								setIsOpen(false)
							}}
							onMouseDown={(e) => e.stopPropagation()}
							className='hover:bg-muted rounded p-1 transition-colors cursor-pointer'
						>
							<X className='h-4 w-4 text-muted-foreground' />
						</button>
					</div>

					{/* Tab Navigation */}
					<div className='flex border-b bg-muted/30 overflow-x-auto scrollbar-hide'>
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
								id: 'seeding' as TabType,
								icon: Sprout,
								label: 'Seeding',
								shortcut: '5'
							}
						].map((tab) => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={cn(
									'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap min-w-fit flex-1 justify-center relative group',
									activeTab === tab.id
										? 'border-primary text-primary bg-background/50'
										: 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
								)}
								title={`Shortcut: ${tab.shortcut}`}
								onMouseDown={(e) => e.stopPropagation()}
							>
								<tab.icon className='h-3.5 w-3.5' />
								{tab.label}
								<span className='ml-1 text-[9px] opacity-50 group-hover:opacity-100 transition-opacity font-mono'>
									{tab.shortcut}
								</span>
							</button>
						))}
					</div>

					<div
						className='p-3 space-y-4 text-sm flex-1 overflow-y-auto custom-scrollbar'
						onMouseDown={(e) => e.stopPropagation()}
						onTouchStart={(e) => e.stopPropagation()}
					>
						{activeTab === 'database' && (
							<DatabaseTab
								stats={stats}
								loading={loading}
								fetchStats={fetchStats}
								resetPosition={resetPosition}
							/>
						)}
						{activeTab === 'users' && <UsersTab stats={stats} />}
						{activeTab === 'cron' && <CronTab />}
						{activeTab === 'health' && (
							<HealthTab
								isConnected={isConnected}
								provider={provider}
								loading={loading}
								fetchStats={fetchStats}
							/>
						)}
						{activeTab === 'seeding' && <SeedingTab />}
					</div>

					{/* Resize Handle */}
					<div
						className='absolute bottom-0 right-0 p-1 cursor-nwse-resize hover:bg-muted transition-colors rounded-tl z-50'
						onMouseDown={(e) => {
							e.stopPropagation()
							e.preventDefault()
							setResizeStart({
								x: e.clientX,
								y: e.clientY,
								w: size.width,
								h: size.height
							})
						}}
					>
						<Grip className='h-4 w-4 text-muted-foreground/50' />
					</div>
				</div>
			)}
		</>
	)
}
