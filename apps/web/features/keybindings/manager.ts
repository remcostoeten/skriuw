import { TKeybinding } from '../commands/types';
import { getCommand } from '../commands/registry';
import { executeCommand } from '../commands/executor';
import { matchesKeybinding, normalizeKeybinding } from './parser';

const keybindings = new Map<string, TKeybinding[]>();
const reverseMap = new Map<string, string>(); // keys -> commandId

// In a real app, storing in localStorage or DB is better
// For now, we'll just keep it in memory initialized from defaults
export async function initializeKeybindings(): Promise<void> {
    const commands = await import('../commands/registry').then(m => m.getAllCommands());

    // Load overrides from localStorage if available
    let overrides: Record<string, string> = {};
    if (typeof window !== 'undefined') {
        try {
            const stored = localStorage.getItem('skriuw-keybindings');
            if (stored) overrides = JSON.parse(stored);
        } catch (e) { console.error('Failed to load keybindings', e); }
    }

    commands.forEach(command => {
        if (command.defaultKeybinding) {
            const defaults = Array.isArray(command.defaultKeybinding)
                ? command.defaultKeybinding
                : [command.defaultKeybinding || '']; // Handle empty/undefined safely

            const keysToCheck = overrides[command.id] ? [overrides[command.id]] : defaults;

            keysToCheck.forEach(k => {
                if (!k) return;
                registerKeybinding({
                    commandId: command.id,
                    keys: normalizeKeybinding(k),
                    priority: 0
                });
            })
        }
    });
}

export function registerKeybinding(binding: TKeybinding): void {
    const normalized = normalizeKeybinding(binding.keys);

    const existingCommandId = reverseMap.get(normalized);
    if (existingCommandId && existingCommandId !== binding.commandId) {
        console.warn(`Keybinding conflict: ${normalized} already bound to ${existingCommandId}`);
        // Priority logic could go here
    }

    const current = keybindings.get(binding.commandId) || [];
    // Avoid duplicates
    if (!current.some(b => b.keys === normalized)) {
        current.push({ ...binding, keys: normalized });
        keybindings.set(binding.commandId, current);
        reverseMap.set(normalized, binding.commandId);
    }
}

export function unregisterKeybinding(commandId: string): void {
    const bindings = keybindings.get(commandId);
    if (bindings) {
        bindings.forEach(b => reverseMap.delete(b.keys));
        keybindings.delete(commandId);
    }
}

export function getKeybinding(commandId: string): TKeybinding | undefined {
    // Return the first one as primary
    return keybindings.get(commandId)?.[0];
}

export function getAllKeybindings(): TKeybinding[] {
    return Array.from(keybindings.values()).flat();
}

export async function updateKeybinding(
    commandId: string,
    newKeys: string
): Promise<boolean> {
    const command = getCommand(commandId);
    if (!command) return false;

    const normalized = normalizeKeybinding(newKeys);
    const existingCommandId = reverseMap.get(normalized);

    if (existingCommandId && existingCommandId !== commandId) {
        return false; // Conflict
    }

    // Clear old bindings for this command (assume replace logic for update)
    unregisterKeybinding(commandId);

    registerKeybinding({
        commandId,
        keys: normalized,
        priority: 0
    });

    // Persist
    if (typeof window !== 'undefined') {
        const overrides: Record<string, string> = {};
        // Re-build overrides map from current state - only primary for now?
        // Simple persistence only supports 1:1 for simplicity?
        // Or we need to persist array.
        // For now, assume update sets the Single Primary.
        overrides[commandId] = normalized;
        // Note: this wipes alternatives if any existed default?
        // User update implies override.

        // We need to merge with existing overrides map logic which was single-key based.
        // A full keybinding manager would need complex config.
        // This is MVP.

        localStorage.setItem('skriuw-keybindings', JSON.stringify(overrides));
    }

    return true;
}

export async function handleKeyboardEvent(
    event: KeyboardEvent,
    context: Record<string, unknown> = {}
): Promise<boolean> {
    // Ignore modifiers-only
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return false;

    const allBindings = Array.from(keybindings.values()).flat();

    for (const binding of allBindings) {
        if (matchesKeybinding(event, binding.keys)) {
            const command = getCommand(binding.commandId);
            if (command && command.enabled) {
                if (!command.when || command.when(context)) {
                    event.preventDefault();
                    event.stopPropagation();
                    await executeCommand(binding.commandId, { ...context, originalEvent: event });
                    return true;
                }
            }
        }
    }
    return false;
}
