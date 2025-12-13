import { TCommand } from './types';

const commands = new Map<string, TCommand>();
const categories = new Map<string, TCommand[]>();

export function registerCommand(command: TCommand): void {
    commands.set(command.id, command);

    const categoryCommands = categories.get(command.category) || [];
    categoryCommands.push(command);
    categories.set(command.category, categoryCommands);
}

export function getCommand(id: string): TCommand | undefined {
    return commands.get(id);
}

export function getAllCommands(): TCommand[] {
    return Array.from(commands.values());
}

export function getCommandsByCategory(category: string): TCommand[] {
    return categories.get(category) || [];
}

export function searchCommands(query: string): TCommand[] {
    const lowerQuery = query.toLowerCase();
    return getAllCommands().filter(cmd =>
        cmd.enabled && (
            cmd.label.toLowerCase().includes(lowerQuery) ||
            cmd.category.toLowerCase().includes(lowerQuery) ||
            cmd.description?.toLowerCase().includes(lowerQuery)
        )
    );
}

export function unregisterCommand(id: string): void {
    const command = commands.get(id);
    if (command) {
        commands.delete(id);
        const categoryCommands = categories.get(command.category);
        if (categoryCommands) {
            categories.set(
                command.category,
                categoryCommands.filter(c => c.id !== id)
            );
        }
    }
}
