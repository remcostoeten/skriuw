import { TCommandContext } from './types';
import { getCommand } from './registry';

// Optional: Import Tauri invoke only if needed, or keep it generic
// import { invoke } from '@tauri-apps/api/core';

export async function executeCommand(
    commandId: string,
    context: TCommandContext = {}
): Promise<boolean> {
    const command = getCommand(commandId);

    if (!command) {
        console.error(`Command not found: ${commandId}`);
        return false;
    }

    if (!command.enabled) {
        console.warn(`Command disabled: ${commandId}`);
        return false;
    }

    if (command.when && !command.when(context)) {
        console.warn(`Command precondition failed: ${commandId}`);
        return false;
    }

    try {
        await command.execute(context);

        // Dispatch global event for legacy React listeners
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('skriuw:command', {
                detail: { id: commandId, context }
            });
            window.dispatchEvent(event);
        }

        // Optional: log command execution
        // await logCommandExecution(commandId, context);
        return true;
    } catch (error) {
        console.error(`Command execution failed: ${commandId}`, error);
        return false;
    }
}
