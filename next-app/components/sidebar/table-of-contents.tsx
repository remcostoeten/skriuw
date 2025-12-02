'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { cn } from '@/shared/utilities'

export interface TableOfContentsItem {
	id: string
	label: string
	level: number
}

type props = {
	items: TableOfContentsItem[]
	className?: string
}

export function TableOfContents({ items, className }: props) {
	const pathname = usePathname()
	const [activeId, setActiveId] = useState<string | null>(null)
	const observerRef = useRef<IntersectionObserver | null>(null)

	useEffect(() => {
		// Reset active item on route change
		setActiveId(null)

		// Set up Intersection Observer to highlight visible sections
		const observerOptions = {
			rootMargin: '-20% 0px -60% 0px',
			threshold: 0,
		}

		observerRef.current = new IntersectionObserver((entries) => {
			// Find the first entry that's intersecting (visible)
			const visibleEntry = entries.find((entry) => entry.isIntersecting)
			if (visibleEntry) {
				setActiveId(visibleEntry.target.id)
			}
		}, observerOptions)

		// Observe all section elements
		items.forEach((item) => {
			const element = document.getElementById(item.id)
			if (element) {
				observerRef.current?.observe(element)
			}
		})

		return () => {
			observerRef.current?.disconnect()
		}
	}, [items, pathname])

	const handleClick = (id: string) => {
		const element = document.getElementById(id)
		if (element) {
			// Smooth scroll to element
			element.scrollIntoView({ behavior: 'smooth', block: 'start' })
			setActiveId(id)
		}
	}

	if (items.length === 0) {
		return null
	}

	return (
		<div
			className={cn(
				'w-[210px] h-full bg-sidebar-background flex flex-col border-r border-sidebar-border',
				className
			)}
		>
			<div className="px-4 py-3 border-b border-sidebar-border">
				<h2 className="text-sm font-semibold text-sidebar-foreground">Table of Contents</h2>
			</div>
			<div className="flex-1 overflow-y-auto px-2 py-2">
				<nav className="space-y-1">
					{items.map((item) => {
						const isActive = activeId === item.id
						const indentLevel = item.level - 1

						return (
							<button
								key={item.id}
								onClick={() => handleClick(item.id)}
								className={cn(
									'w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors',
									'focus:outline-none focus:ring-1 focus:ring-sidebar-ring',
									isActive
										? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
										: 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
								)}
								style={{
									paddingLeft: `${8 + indentLevel * 16}px`,
								}}
							>
								{item.label}
							</button>
						)
					})}
				</nav>
			</div>
		</div>
	)
}
