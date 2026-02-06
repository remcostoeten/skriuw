'use client'

import type { RecentActivityGroup, RecentActivityItem } from '../types'
import type { EntityType, ActionType } from '@skriuw/db'
import {
	FileText,
	Folder,
	CheckSquare,
	Plus,
	Pencil,
	Trash2,
	Check,
	X,
	Move,
	Pin,
	PinOff,
	Star,
	StarOff
} from 'lucide-react'
import Link from 'next/link'

type RecentActivityListProps = {
	groups: RecentActivityGroup[]
	onLoadMore?: () => void
	hasMore?: boolean
	isLoading?: boolean
	className?: string
}

const ENTITY_ICONS: Record<EntityType, typeof FileText> = {
	note: FileText,
	folder: Folder,
	task: CheckSquare
}

const ACTION_ICONS: Record<ActionType, typeof Plus> = {
	created: Plus,
	updated: Pencil,
	deleted: Trash2,
	checked: Check,
	unchecked: X,
	moved: Move,
	pinned: Pin,
	unpinned: PinOff,
	favorited: Star,
	unfavorited: StarOff
}

const ACTION_LABELS: Record<ActionType, string> = {
	created: 'created',
	updated: 'updated',
	deleted: 'deleted',
	checked: 'completed',
	unchecked: 'uncompleted',
	moved: 'moved',
	pinned: 'pinned',
	unpinned: 'unpinned',
	favorited: 'favorited',
	unfavorited: 'unfavorited'
}

/**
 * Displays recent activity grouped by date.
 * Each item shows the entity type, action, and name with navigation.
 */
export function RecentActivityList({
	groups,
	onLoadMore,
	hasMore,
	isLoading,
	className = ''
}: RecentActivityListProps) {
	if (!groups.length && !isLoading) {
		return (
			<div
				className={`flex flex-col items-center justify-center py-12 text-zinc-500 ${className}`}
			>
				<FileText className='w-12 h-12 mb-4 opacity-50' />
				<p>No recent activity</p>
				<p className='text-sm'>Your activity will appear here</p>
			</div>
		)
	}

	return (
		<div className={`flex flex-col gap-6 ${className}`}>
			{groups.map((group) => (
				<div key={group.date} className='flex flex-col gap-2'>
					{/* Date header */}
					<h3 className='text-sm font-medium text-zinc-400 sticky top-0 bg-zinc-950/80 backdrop-blur-sm py-2 z-10'>
						{formatGroupDate(group.date)}
					</h3>

					{/* Activity items */}
					<div className='flex flex-col gap-1'>
						{group.items.map((item) => (
							<ActivityItem key={item.id} item={item} />
						))}
					</div>
				</div>
			))}

			{/* Load more button */}
			{hasMore && (
				<button
					onClick={onLoadMore}
					disabled={isLoading}
					className='py-3 px-4 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-lg transition-colors disabled:opacity-50'
				>
					{isLoading ? 'Loading...' : 'Load more'}
				</button>
			)}
		</div>
	)
}

function ActivityItem({ item }: { item: RecentActivityItem }) {
	const EntityIcon = ENTITY_ICONS[item.entityType]
	const ActionIcon = ACTION_ICONS[item.action]
	const actionLabel = ACTION_LABELS[item.action]

	// Build the link URL based on entity type
	const href =
		item.entityType === 'note'
			? `/note/${item.entityId}`
			: item.entityType === 'folder'
				? `/?folder=${item.entityId}`
				: item.entityType === 'task'
					? `/tasks?task=${item.entityId}`
					: '#'

	const isDeleted = item.action === 'deleted'

	const content = (
		<div className='flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors group'>
			{/* Entity icon */}
			<div className='flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center'>
				<EntityIcon className='w-4 h-4 text-zinc-400' />
			</div>

			{/* Content */}
			<div className='flex-1 min-w-0'>
				<div className='flex items-center gap-2'>
					<ActionIcon className='w-3 h-3 text-zinc-500 flex-shrink-0' />
					<span className='text-sm text-zinc-300 truncate'>
						<span className='text-zinc-500'>{actionLabel}</span>{' '}
						<span className={isDeleted ? 'line-through text-zinc-500' : 'font-medium'}>
							{item.entityName}
						</span>
					</span>
				</div>
				<p className='text-xs text-zinc-500 mt-0.5'>{formatTime(item.createdAt)}</p>
			</div>

			{/* Arrow indicator */}
			{!isDeleted && (
				<div className='opacity-0 group-hover:opacity-100 transition-opacity'>
					<svg
						className='w-4 h-4 text-zinc-500'
						fill='none'
						viewBox='0 0 24 24'
						stroke='currentColor'
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth={2}
							d='M9 5l7 7-7 7'
						/>
					</svg>
				</div>
			)}
		</div>
	)

	if (isDeleted) {
		return content
	}

	return (
		<Link href={href} className='block'>
			{content}
		</Link>
	)
}

function formatGroupDate(dateStr: string): string {
	const date = new Date(dateStr)
	const today = new Date()
	today.setHours(0, 0, 0, 0)

	const yesterday = new Date(today)
	yesterday.setDate(yesterday.getDate() - 1)

	const targetDate = new Date(dateStr)
	targetDate.setHours(0, 0, 0, 0)

	if (targetDate.getTime() === today.getTime()) {
		return 'Today'
	}
	if (targetDate.getTime() === yesterday.getTime()) {
		return 'Yesterday'
	}

	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	})
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	})
}
