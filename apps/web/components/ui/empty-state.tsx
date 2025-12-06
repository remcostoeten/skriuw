import React from 'react'

interface EmptyStateProps {
	children?: React.ReactNode
	className?: string
	icon?: React.ReactNode
	title?: string
	description?: string
	actions?: Array<{
		label: string
		onClick: () => void
		separator?: boolean
	}>
}

export function EmptyState({
	children,
	className = '',
	icon,
	title,
	description,
	actions,
}: EmptyStateProps) {
	return (
		<div className={`flex flex-col items-center justify-center text-center p-8 ${className}`}>
			{icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
			{title && <h3 className="text-lg font-medium mb-2">{title}</h3>}
			{description && <p className="text-muted-foreground mb-4">{description}</p>}
			{actions && (
				<div className="flex flex-col gap-2 mt-4">
					{actions.map((action, index) => (
						<button
							key={index}
							onClick={action.onClick}
							className="px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
						>
							{action.label}
						</button>
					))}
				</div>
			)}
			{children}
		</div>
	)
}
