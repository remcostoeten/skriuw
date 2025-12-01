import { ShortcutDisplay } from '@/features/shortcuts';

import type { KeyboardShortcut, DisplayFormat } from '@/features/shortcuts';

type props = {
	/**
	 * Keyboard shortcut to display (typed format only)
	 */
	shortcut?: KeyboardShortcut;
	separator?: boolean;
	format?: DisplayFormat;
	className?: string;
};

/**
 * Keyboard shortcut display component
 */
export function Kbd({ shortcut, separator = false, format = 'text', className = '' }: props) {
	if (!shortcut) return null;

	return (
		<ShortcutDisplay
			shortcut={shortcut}
			format={format}
			separator={separator}
			className={className}
		/>
	);
}