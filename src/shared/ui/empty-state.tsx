import React from 'react';

import { Kbd } from '@/shared/ui/kbd';

import type { KeyboardShortcut } from '@/features/shortcuts';

export type EmptyStateAction = {
	label: string;
	/**
	 * Keyboard shortcut to display (typed format only)
	 */
	shortcut?: KeyboardShortcut;
	separator?: boolean;
	onClick: () => void;
};

type props = {
	message: string;
	submessage?: string;
	actions?: EmptyStateAction[];
	icon?: React.ReactNode;
	variant?: 'default' | 'destructive';
};

export function EmptyState({ message, submessage, actions = [], icon, variant = 'default' }: props) {
	const isDestructive = variant === 'destructive';

	return (
		<div className="flex flex-col items-center gap-3 max-w-sm">
			{icon && (
				<div className={`${isDestructive ? 'text-destructive/60' : 'text-muted-foreground'}`}>
					{icon}
				</div>
			)}
			<div className="flex flex-col items-center gap-2 text-center">
				<p className={`text-lg font-medium ${
					isDestructive
						? 'text-destructive/90'
						: 'text-secondary-foreground'
				}`}>
					{message}
				</p>
				{submessage && (
					<p className={`text-sm ${
						isDestructive
							? 'text-destructive/60'
							: 'text-muted-foreground'
					}`}>
						{submessage}
					</p>
				)}
			</div>
			{actions.length > 0 && (
				<div className="flex flex-col sm:flex-row gap-3 mt-2">
					{actions.map((action, index) => (
						<button
							key={index}
							onClick={action.onClick}
							className={`flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-colors min-w-[140px] ${
								isDestructive
									? 'text-destructive/80 hover:text-destructive hover:bg-destructive/10'
									: 'text-muted-foreground hover:text-secondary-foreground hover:bg-accent'
							}`}
						>
							{action.shortcut && (
								<Kbd shortcut={action.shortcut} separator={action.separator} />
							)}
							<span className="text-sm font-medium">{action.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

