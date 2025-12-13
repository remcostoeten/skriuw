import { registerCommand } from '../registry';
import { fileCommands } from './file';
import { editCommands } from './edit';
import { viewCommands } from './view';
import { navigationCommands } from './navigation';
import { splitViewCommands } from './split-view';

export function initializeCommands(): void {
    [
        ...fileCommands,
        ...editCommands,
        ...viewCommands,
        ...navigationCommands,
        ...splitViewCommands
    ].forEach(registerCommand);
}
