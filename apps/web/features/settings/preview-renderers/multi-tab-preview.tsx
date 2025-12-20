'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { PreviewProps } from '../types'

// Mock tab data for preview
const mockTabs = [
	{ id: '1', title: 'Welcome.md', isActive: true },
	{ id: '2', title: 'Meeting Notes.txt', isActive: false },
	{ id: '3', title: 'Project Ideas.md', isActive: false },
	{ id: '4', title: 'Todo List.task', isActive: false },
]

export default function MultiTabPreview({ value }: PreviewProps<boolean>) {
	const [isHovering, setIsHovering] = useState(false)
	const [currentDemo, setCurrentDemo] = useState<'idle' | 'switch' | 'close' | 'new'>('idle')
	const [activeTab, setActiveTab] = useState('1')
	const [tabs, setTabs] = useState(mockTabs)
	const demoTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const animationFrameRef = useRef<number | null>(null)

	// Auto-demo functionality
	useEffect(() => {
		if (isHovering && value) {
			// Cycle through different demos
			const demos: Array<'idle' | 'switch' | 'close' | 'new'> = ['switch', 'close', 'new']
			let index = 0
			let demoIndex = 0

			const cycleDemos = () => {
				demoIndex = index
				setCurrentDemo(demos[index])

				// Execute the demo action with stable references
				switch (demos[index]) {
					case 'switch':
						// Switch to next tab using current state
						setActiveTab(current => {
							const currentTabs = mockTabs
							const nextIndex = (currentTabs.findIndex(t => t.id === current) + 1) % currentTabs.length
							return currentTabs[nextIndex].id
						})
						break
					case 'close':
						// Close a tab and add it back (using a timeout ref for cleanup)
						const timeoutId = setTimeout(() => {
							setTabs(prev => {
								if (prev.length > 2) {
									const tabIndexToClose = prev.findIndex(t => t.id !== activeTab)
									const tabToClose = prev[tabIndexToClose]
									const newTabs = prev.filter(t => t.id !== tabToClose.id)
									// Add it back after a delay
									setTimeout(() => {
										setTabs(prevTabs => [...prevTabs, tabToClose])
									}, 1500)
									return newTabs
								}
								return prev
							})
						}, 1000)
						demoTimeoutRef.current = timeoutId
						break
					case 'new':
						// Add a new tab temporarily
						const newTabTimeout = setTimeout(() => {
							setTabs(prev => [...prev, { id: 'temp', title: 'New Note.md', isActive: false }])
							// Remove it after delay
							setTimeout(() => {
								setTabs(prev => prev.filter(t => t.id !== 'temp'))
							}, 2000)
						}, 1000)
						demoTimeoutRef.current = newTabTimeout
						break
				}

				index = (index + 1) % demos.length
			}

			// Start first demo after a short delay
			demoTimeoutRef.current = setTimeout(cycleDemos, 500)

			// Cycle through demos
			const interval = setInterval(cycleDemos, 4000)

			return () => {
				if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current)
				if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
				clearInterval(interval)
				// Reset to original state
				setTabs(mockTabs)
				setActiveTab('1')
			}
		} else {
			setCurrentDemo('idle')
			if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current)
			// Reset to original state
			setTabs(mockTabs)
			setActiveTab('1')
		}
	}, [isHovering, value])

	const getDemoHint = () => {
		switch (currentDemo) {
			case 'switch':
				return '🔄 Click tabs to switch between notes'
			case 'close':
				return '❌ Click × to close tabs'
			case 'new':
				return '➕ Open multiple notes at once'
			default:
				return '💡 Keep multiple notes open simultaneously'
		}
	}

	const handleTabClick = useCallback((tabId: string) => {
		if (value) {
			setActiveTab(tabId)
		}
	}, [value])

	const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
		e.stopPropagation()
		if (value && tabs.length > 1) {
			const newTabs = tabs.filter(t => t.id !== tabId)
			setTabs(newTabs)
			if (activeTab === tabId) {
				const newActiveIndex = Math.max(0, mockTabs.findIndex(t => t.id === tabId) - 1)
				setActiveTab(newTabs[newActiveIndex]?.id || newTabs[0]?.id)
			}
		}
	}, [value, tabs.length, activeTab])

	return (
		<div
			className="mt-3 rounded-md overflow-hidden border border-border transition-all duration-200"
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
		>
			<div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
				<span>Multi-Note Tabs Preview</span>
				<span className="font-medium">{value ? 'Enabled' : 'Disabled'}</span>
			</div>

			{/* Demo hints */}
			<div
				className="text-xs px-3 py-1 bg-muted/30 border-b border-border/50 text-muted-foreground transition-all duration-500"
				style={{
					opacity: isHovering && value ? 1 : 0.7,
					transform: isHovering && value ? 'translateY(0)' : 'translateY(-2px)',
				}}
			>
				{getDemoHint()}
			</div>

			{/* Tab interface preview */}
			<div
				className="relative bg-background-secondary transition-all duration-300"
				style={{
					height: value ? '200px' : '120px',
					opacity: value ? 1 : 0.3,
					pointerEvents: value ? 'auto' : 'none' as const,
				}}
			>
				{value ? (
					<div className="h-full flex flex-col">
						{/* Tab bar */}
						<div className="flex border-b border-border bg-background/50 backdrop-blur-sm">
							{tabs.map((tab, index) => (
								<div
									key={tab.id}
									className={`group relative flex items-center px-3 py-2 text-xs font-medium border-r border-border/50 cursor-pointer transition-all duration-200 ${tab.id === activeTab
											? 'bg-accent text-accent-foreground border-b-2 border-b-accent'
											: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
										} ${currentDemo === 'switch' && tab.id === activeTab ? 'animate-pulse' : ''
										} ${currentDemo === 'close' && tab.id !== activeTab ? 'animate-pulse opacity-50' : ''
										} ${currentDemo === 'new' && tab.id === 'temp' ? 'animate-pulse bg-muted/30' : ''
										}`}
									onClick={() => handleTabClick(tab.id)}
									style={{
										minWidth: '100px',
										maxWidth: '150px',
									}}
								>
									{/* File icon */}
									<span className="mr-2 text-[10px]">
										{tab.title.endsWith('.md') ? '📝' :
											tab.title.endsWith('.txt') ? '📄' :
												tab.title.endsWith('.task') ? '✅' : '📄'}
									</span>

									{/* Tab title */}
									<span className="truncate flex-1 text-left">
										{tab.title}
									</span>

									{/* Close button */}
									<button
										onClick={(e) => handleCloseTab(e, tab.id)}
										className="ml-2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground flex items-center justify-center transition-all duration-150"
									>
										<span className="text-[10px] leading-none">×</span>
									</button>

									{/* Active tab indicator */}
									{tab.id === activeTab && (
										<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
									)}
								</div>
							))}

							{/* New tab button */}
							<div
								className={`px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-all duration-200 border-r border-border/50 ${currentDemo === 'new' ? 'animate-pulse bg-muted/30' : ''
									}`}
							>
								<span className="text-[12px]">+</span>
							</div>

							{/* Tab overflow indicator */}
							<div className="px-2 py-2 text-xs text-muted-foreground border-r border-border/50">
								···
							</div>
						</div>

						{/* Content area */}
						<div className="flex-1 p-4 overflow-hidden">
							<div className="h-full bg-background rounded border border-border/30 p-3">
								{/* Simulated content based on active tab */}
								<div className="animate-fadeIn">
									{tabs.find(t => t.id === activeTab)?.title.endsWith('.md') ? (
										<div className="space-y-2">
											<div className="font-semibold text-sm"># {tabs.find(t => t.id === activeTab)?.title}</div>
											<div className="text-xs text-muted-foreground space-y-1">
												<div className="h-2 w-3/4 bg-current/20 rounded" />
												<div className="h-2 w-full bg-current/20 rounded" />
												<div className="h-2 w-5/6 bg-current/20 rounded" />
											</div>
										</div>
									) : tabs.find(t => t.id === activeTab)?.title.endsWith('.task') ? (
										<div className="space-y-2">
											<div className="font-semibold text-sm">📋 {tabs.find(t => t.id === activeTab)?.title}</div>
											<div className="space-y-1">
												<div className="flex items-center gap-2 text-xs">
													<span>☐</span>
													<div className="h-2 w-24 bg-current/20 rounded" />
												</div>
												<div className="flex items-center gap-2 text-xs">
													<span>☑</span>
													<div className="h-2 w-32 bg-current/20 rounded line-through" />
												</div>
											</div>
										</div>
									) : (
										<div className="space-y-2">
											<div className="font-mono text-xs">{tabs.find(t => t.id === activeTab)?.title}</div>
											<div className="text-xs space-y-1">
												<div className="h-2 w-full bg-current/20 rounded" />
												<div className="h-2 w-4/5 bg-current/20 rounded" />
												<div className="h-2 w-full bg-current/20 rounded" />
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="h-full flex items-center justify-center text-muted-foreground">
						<div className="text-center">
							<div className="text-4xl mb-2">📑</div>
							<div className="text-sm">Multi-Tabs Disabled</div>
						</div>
					</div>
				)}
			</div>

			{/* Feature highlights */}
			{isHovering && value && (
				<div className="px-3 py-2 bg-muted/20 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
					<div className="flex items-center gap-1 text-muted-foreground">
						<span className="font-medium">🔄</span>
						<span>Quick Switch</span>
					</div>
					<div className="flex items-center gap-1 text-muted-foreground">
						<span className="font-medium">💾</span>
						<span>Auto Save</span>
					</div>
					<div className="flex items-center gap-1 text-muted-foreground">
						<span className="font-medium">⚡</span>
						<span>Instant Access</span>
					</div>
				</div>
			)}

			<style jsx>{`
				@keyframes fadeIn {
					from {
						opacity: 0;
						transform: translateY(5px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				.animate-fadeIn {
					animation: fadeIn 0.3s ease-out;
				}
			`}</style>
		</div>
	)
}