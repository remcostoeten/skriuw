import { shortcut } from '@/features/shortcuts'
import { cn } from '@skriuw/shared'
import React from 'react'

interface EmptyStateProps {
	children?: React.ReactNode
	className?: string
	icon?: React.ReactNode
	title?: string
	description?: string
	message?: string
	isError?: string
	isFull?: boolean
	submessage?: string
	actions?: Array<{
		label: string
		onClick: () => void
		separator?: boolean
		shortcut?: any
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
	actions,
}: EmptyStateProps) {
	return (
		<div
			className={`flex flex-col items-center justify-center text-center p-8 ${isFull ? 'min-h-screen' : ''} ${className}`}
		>
			{icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
			{message && <h1 className="text-2xl font-bold mb-2">{message}</h1>}
			{title && <h3 className="text-lg font-medium mb-2">{title}</h3>}
			{description && <p className="text-muted-foreground mb-4">{description}</p>}
			{submessage && (
				<p className={cn('mb-4', isError ? 'text-destructive' : 'text-muted-foreground')}>
					{submessage}
				</p>
			)}
			{actions && (
				<div className="flex flex-wrap items-center justify-center gap-3 mt-6 w-full px-4">
					{actions.map((action, index) => {
						// Extract shortcut info if available
						// Assuming standard structure for simple shortcuts: sequences[0][0]
						const combo = action.shortcut?.sequences?.[0]?.[0]

						return (
							<button
								key={index}
								onClick={action.onClick}
								className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-colors min-w-[120px] max-w-full text-muted-foreground hover:text-secondary-foreground hover:bg-accent border border-transparent hover:border-border/50"
							>
								{combo && (
									<span className="inline-flex items-center gap-1">
										<kbd className="pointer-events-none inline-flex h-6 min-w-[24px] tracking-wider select-none items-center justify-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-sm">
											{combo.modifiers?.map((mod: string) => (
												<span key={mod}>{mod}</span>
											))}
											{combo.modifiers?.length > 0 && <span className="text-muted-foreground/60">+</span>}
											<span>{combo.key}</span>
										</kbd>
									</span>
								)}
								<span className="text-sm font-medium">{action.label}</span>
							</button>
						)
					})}
				</div>
			)}
			{children}
		</div>
	)
}
