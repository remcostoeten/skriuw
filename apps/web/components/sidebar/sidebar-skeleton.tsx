'use client'

import { Skeleton } from '@skriuw/ui/skeleton'
import { FolderPlus, Maximize2, Plus, Search } from 'lucide-react'

type SidebarSkeletonProps = {
	itemCount?: number
	hasNestedItems?: boolean
}

/**
 * Skeleton loader for sidebar that mimics the actual file tree structure
 * This ensures zero layout shift when real data loads
 */
export function SidebarSkeleton({ itemCount = 8, hasNestedItems = true }: SidebarSkeletonProps) {
	return (
		<div className='hidden lg:flex w-[210px] h-full bg-sidebar-background flex-col border-r border-sidebar-border'>
			{/* Action Bar - static placeholder since buttons don't need loading state */}
			<div className='h-10 border-b border-sidebar-border bg-sidebar-background flex items-center justify-center'>
				<div className='flex items-center gap-1 opacity-50'>
					{/* Static icons - no loading state needed */}
					<div className='p-1'>
						<Plus className='h-4 w-4' />
					</div>
					<div className='p-1'>
						<FolderPlus className='h-4 w-4' />
					</div>
					<div className='p-1'>
						<Maximize2 className='h-4 w-4' />
					</div>
					<div className='p-1'>
						<Search className='h-4 w-4' />
					</div>
				</div>
			</div>

			{/* File Tree Skeleton */}
			<div className='flex-1 overflow-y-auto px-1 pb-4'>
				<div className='flex flex-col gap-0.5 pl-2 pt-2'>
					{Array.from({ length: itemCount }).map((_, i) => {
						const isFolder = i % 3 === 0 // Every 3rd item is a folder
						const hasChildren = isFolder && hasNestedItems && i < 3

						return (
							<div key={i}>
								{/* Main Item */}
								<div className='flex items-center justify-between h-7 rounded-md px-1'>
									<div className='flex items-center gap-1 flex-1'>
										<Skeleton className='h-4 w-4' />
										<Skeleton className='h-3 w-[120px]' />
									</div>
									{isFolder && <Skeleton className='h-3 w-4' />}
								</div>

								{/* Nested Items */}
								{hasChildren && (
									<div className='ml-3 space-y-0.5 mt-0.5'>
										{Array.from({ length: 2 }).map((_, j) => (
											<div
												key={j}
												className='flex items-center gap-1 h-7 px-1'
											>
												<Skeleton className='h-4 w-4' />
												<Skeleton className='h-3 w-[100px]' />
											</div>
										))}
									</div>
								)}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
