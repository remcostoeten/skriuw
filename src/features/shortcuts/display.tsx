/**
 * Display utilities for keyboard shortcuts
 * Supports text, icon, and mixed display formats with platform awareness
 */

import React from 'react';

import { MODIFIER_ICONS, KEY_ICONS } from './types';

import type {
	KeyboardShortcut,
	DisplayKeyCombo,
	Modifier,
	RegularKey,
	DisplayFormat,
} from './types';

/**
 * Detects if the user is on macOS
 */
export function isMacOS(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		/Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
		/Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
	);
}

/**
 * Converts modifier keys to platform-appropriate display
 */
function normalizeModifier(modifier: Modifier, format: DisplayFormat = 'text'): string {
	const isMac = isMacOS();

	if (format === 'icon') {
		return MODIFIER_ICONS[modifier];
	}

	if (modifier === 'Cmd' || modifier === 'Meta') {
		return isMac ? '⌘' : 'Ctrl';
	}

	if (modifier === 'Ctrl') {
		return isMac ? '⌃' : 'Ctrl';
	}

	return modifier;
}

/**
 * Converts a regular key to display format
 */
function normalizeKey(key: RegularKey, format: DisplayFormat = 'text'): string {
	if (format === 'icon' && KEY_ICONS[key as keyof typeof KEY_ICONS]) {
		return KEY_ICONS[key as keyof typeof KEY_ICONS]!;
	}

	// Convert special keys to readable text
	const keyMap: Record<string, string> = {
		Space: 'Space',
		Enter: 'Enter',
		Tab: 'Tab',
		Escape: 'Esc',
		Backspace: 'Backspace',
		Delete: 'Delete',
		ArrowUp: '↑',
		ArrowDown: '↓',
		ArrowLeft: '←',
		ArrowRight: '→',
	};

	return keyMap[key] || key;
}

/**
 * Converts a key combo to display string
 */
function comboToString(combo: DisplayKeyCombo, format: DisplayFormat = 'text'): string {
	const parts: string[] = [];

	if (combo.modifiers && combo.modifiers.length > 0) {
		parts.push(...combo.modifiers.map((m) => normalizeModifier(m, format)));
	}

	parts.push(normalizeKey(combo.key, format));

	return parts.join(format === 'icon' ? '' : '+');
}

/**
 * Checks if an item in a sequence is a DisplayKeyCombo
 */
function isKeyCombo(item: any): item is DisplayKeyCombo {
	return item && typeof item === 'object' && 'key' in item;
}

/**
 * Converts a keyboard shortcut to display string(s)
 */
export function shortcutToString(
	shortcut: KeyboardShortcut,
	format: DisplayFormat = 'text',
	separator: string = ' '
): string {
	const formatToUse = shortcut.displayFormat || format;
	const sequences = shortcut.sequences.map((seq) => {
		const combos = seq.filter(isKeyCombo) as DisplayKeyCombo[];
		return combos.map((combo) => comboToString(combo, formatToUse)).join(' ');
	});

	return sequences.join(separator);
}

/**
 * Converts a keyboard shortcut to an array of key parts for rendering
 */
export function shortcutToParts(
	shortcut: KeyboardShortcut,
	format: DisplayFormat = 'text'
): Array<Array<Array<{ type: 'modifier' | 'key'; value: string }>>> {
	const formatToUse = shortcut.displayFormat || format;

	return shortcut.sequences.map((seq) => {
		const combos = seq.filter(isKeyCombo) as DisplayKeyCombo[];
		return combos.map((combo) => {
			const parts: Array<{ type: 'modifier' | 'key'; value: string }> = [];

			if (combo.modifiers && combo.modifiers.length > 0) {
				combo.modifiers.forEach((mod) => {
					parts.push({
						type: 'modifier',
						value: normalizeModifier(mod, formatToUse),
					});
				});
			}

			parts.push({
				type: 'key',
				value: normalizeKey(combo.key, formatToUse),
			});

			return parts;
		});
	});
}

/**
 * React component props for displaying shortcuts
 */
export type ShortcutDisplayProps = {
	shortcut: KeyboardShortcut;
	format?: DisplayFormat;
	separator?: boolean;
	className?: string;
};

/**
 * React component for displaying keyboard shortcuts
 */
export function ShortcutDisplay({
	shortcut,
	format = 'text',
	separator = true,
	className = '',
}: ShortcutDisplayProps) {
	const formatToUse = shortcut.displayFormat || format;
	const parts = shortcutToParts(shortcut, formatToUse);

	return (
		<span className={`inline-flex items-center gap-1 ${className}`}>
			{parts.map((sequence, seqIndex) => (
				<React.Fragment key={seqIndex}>
					{seqIndex > 0 && <span className="mx-1 text-muted-foreground">then</span>}
					{sequence.map((combo, comboIndex) => (
						<React.Fragment key={comboIndex}>
							{comboIndex > 0 && (
								<span className="mx-0.5 text-muted-foreground">
									{formatToUse === 'icon' ? '' : ' '}
								</span>
							)}
							<kbd className="pointer-events-none inline-flex h-6 min-w-[24px] tracking-wider select-none items-center justify-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-sm">
								{combo.map((part, partIndex) => (
									<React.Fragment key={partIndex}>
										<span>{part.value}</span>
										{separator && partIndex < combo.length - 1 && formatToUse !== 'icon' && (
											<span className="text-muted-foreground/60">+</span>
										)}
									</React.Fragment>
								))}
							</kbd>
						</React.Fragment>
					))}
				</React.Fragment>
			))}
		</span>
	);
}

