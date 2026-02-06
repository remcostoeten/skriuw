'use client'

import { cn } from '@skriuw/shared'
import { Info } from 'lucide-react'
import { useState } from 'react'

type HintPopoverProps = {
	hint: string
	className?: string
}

export function HintPopover({ hint, className }: HintPopoverProps) {
	const [isOpen, setIsOpen] = useState(false)

	return (
		<div className='relative inline-block'>
			<button
				type='button'
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					'inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-muted transition-colors',
					className
				)}
			>
				<Info className='h-3 w-3 text-muted-foreground' />
			</button>
			{isOpen && (
				<div className='absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 text-xs bg-popover text-popover-foreground border rounded-lg shadow-lg'>
					<div className='relative'>
						{hint}
						<div className='absolute -bottom-3 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-popover border-r border-b' />
					</div>
				</div>
			)}
		</div>
	)
}
