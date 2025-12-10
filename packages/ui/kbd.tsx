import React from 'react'
import { cn } from '@skriuw/shared'

interface KbdProps {
	children?: React.ReactNode
	className?: string
	shortcut?: {
		sequences: Array<Array<any>>
	}
}

export function Kbd({ children, className, shortcut }: KbdProps) {
	if (shortcut && shortcut.sequences && shortcut.sequences.length > 0) {
		const firstSequence = shortcut.sequences[0]
		const keyCombo = firstSequence.find(
			(item) => typeof item === 'object' && item.key
		)

		if (keyCombo) {
			const keys = []
			if (keyCombo.modifiers) {
				keys.push(...keyCombo.modifiers)
			}
			keys.push(keyCombo.key)

			return (
				<kbd
					className={cn(
						'inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-muted border border-border rounded-md',
						className
					)}
				>
					{keys.map((key: any, index: number) => (
						<React.Fragment key={index}>
							{index > 0 && (
								<span className="text-muted-foreground">+</span>
							)}
							<span>{key}</span>
						</React.Fragment>
					))}
				</kbd>
			)
		}
	}

	return (
		<kbd
			className={cn(
				'inline-flex items-center px-2 py-1 text-xs font-mono bg-muted border border-border rounded-md',
				className
			)}
		>
			{children}
		</kbd>
	)
}
