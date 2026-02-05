import { cn } from '@skriuw/shared'
import React from 'react'

type EmptyStateProps = {
	children?: React.ReactNode
	className?: string
	icon?: React.ReactNode
	title?: string
	description?: string
	message?: string
	isError?: boolean
	isFull?: boolean
	submessage?: string
	actions?: Array<{
		label: string
		onClick: () => void
		separator?: boolean
		/**
		 * Shortcut to display, e.g. { key: 'K', modifiers: ['⌘'] }
		 * Previously relied on @/features/shortcuts, now fully prop-driven for shared UI
		 */
		shortcut?: {
			key: string
			modifiers?: string[]
		}
	}>
}

export function EmptyState({
	children,
	className = '',
	icon,
	title,
	description,
	message,
	isError,
	isFull,
	submessage,
	actions
}: EmptyStateProps) {
	return (
		<div
			className={`flex flex-col items-center justify-center text-center p-8 ${isFull ? 'min-h-screen' : ''} ${className}`}
		>
			{icon && <div className='mb-4 text-muted-foreground'>{icon}</div>}
			{message && <h1 className='text-2xl font-bold mb-2'>{message}</h1>}
			{title && <h3 className='text-lg font-medium mb-2'>{title}</h3>}
			{description && <p className='text-muted-foreground mb-4'>{description}</p>}
			{submessage && (
				<p className={cn('mb-4', isError ? 'text-destructive' : 'text-muted-foreground')}>
					{submessage}
				</p>
			)}
			{actions && actions.length > 0 && (
				<div className='flex flex-wrap items-center justify-center gap-3 mt-6'>
					{actions.map((action, index) => {
						const { shortcut } = action

						return (
							<button
								key={index}
								onClick={action.onClick}
								className='inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border/50 hover:border-border'
							>
								<span>{action.label}</span>
								{shortcut && (
									<kbd className='pointer-events-none inline-flex h-5 min-w-[20px] select-none items-center justify-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm'>
										{shortcut.modifiers?.map((mod: string, i: number) => (
											<span key={i}>{mod}</span>
										))}
										{shortcut.modifiers && shortcut.modifiers.length > 0 && (
											<span className='text-muted-foreground/60'>+</span>
										)}
										<span>{shortcut.key}</span>
									</kbd>
								)}
							</button>
						)
					})}
				</div>
			)}
			{children}
		</div>
	)
}
