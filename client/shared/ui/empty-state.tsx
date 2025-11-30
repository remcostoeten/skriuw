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
};

export function EmptyState({ message, submessage, actions = [], icon }: props) {
	return (
		<div className="flex flex-col items-center gap-2">
			{icon && <div className="text-muted-foreground">{icon}</div>}
			<div className="flex flex-col items-center gap-1">
				<p className="text-secondary-foreground/85">{message}</p>
				{submessage && <p className="text-sm text-muted-foreground">{submessage}</p>}
			</div>
			{actions.length > 0 && (
				<div className="flex gap-5">
					{actions.map((action, index) => (
						<button
							key={index}
							onClick={action.onClick}
							className="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
						>
							{action.shortcut && <Kbd shortcut={action.shortcut} separator={action.separator} />}
							{action.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

