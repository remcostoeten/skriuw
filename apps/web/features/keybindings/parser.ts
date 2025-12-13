export type TParsedKey = {
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
};

export function parseKeybinding(keybinding: string): TParsedKey {
    const parts = keybinding.split('+').map(p => p.trim());

    return {
        ctrl: parts.includes('Ctrl') || parts.includes('Control'),
        shift: parts.includes('Shift'),
        alt: parts.includes('Alt'),
        meta: parts.includes('Meta') || parts.includes('Cmd'),
        key: parts[parts.length - 1]
    };
}

export function normalizeKeybinding(keybinding: string): string {
    const parsed = parseKeybinding(keybinding);
    const parts: string[] = [];

    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.shift) parts.push('Shift');
    if (parsed.alt) parts.push('Alt');
    if (parsed.meta) parts.push('Meta');
    parts.push(parsed.key);

    return parts.join('+');
}

export function matchesKeybinding(event: KeyboardEvent, keybinding: string): boolean {
    const parsed = parseKeybinding(keybinding);

    return (
        event.key.toLowerCase() === parsed.key.toLowerCase() &&
        event.ctrlKey === parsed.ctrl &&
        event.shiftKey === parsed.shift &&
        event.altKey === parsed.alt &&
        event.metaKey === parsed.meta
    );
}

export function formatKeybinding(keybinding: string): string {
    const isMac = typeof navigator !== 'undefined' &&
        navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    return keybinding
        .replace(/Ctrl/g, isMac ? '⌘' : 'Ctrl')
        .replace(/Shift/g, isMac ? '⇧' : 'Shift')
        .replace(/Alt/g, isMac ? '⌥' : 'Alt')
        .replace(/Meta/g, '⌘');
}
