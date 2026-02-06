'use client'

import type { TOCItem as TOCItemType } from './types'
import { cn } from '@skriuw/shared'
import { memo, useCallback } from 'react'

type TOCItemProps = {
	item: TOCItemType
	depth?: number
	onNavigate: (headingId: string) => void
}

export const TOCItem = memo(function TOCItem({ item, depth = 0, onNavigate }: TOCItemProps) {
	const handleClick = useCallback(() => {
		onNavigate(item.id)
	}, [item.id, onNavigate])

	return (
		<div>
			<button
				type='button'
				onClick={handleClick}
				className={cn(
					'w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors',
					'flex items-center gap-2 text-muted-foreground hover:text-foreground',
					depth > 0 && 'ml-4'
				)}
			>
				<span className='truncate'>{item.title}</span>
			</button>
			{item.children.length > 0 && (
				<div className='space-y-0.5'>
					{item.children.map((child) => (
						<TOCItem
							key={child.id}
							item={child}
							depth={depth + 1}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			)}
		</div>
	)
})
