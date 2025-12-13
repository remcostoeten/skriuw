import { TCommand } from '../types';

export const editCommands: TCommand[] = [
    {
        id: 'edit.undo',
        label: 'Undo',
        category: 'Edit',
        icon: '↶',
        defaultKeybinding: 'Ctrl+Z',
        enabled: true,
        execute: (context) => {
            // Hook into editor undo
        }
    },
    {
        id: 'edit.redo',
        label: 'Redo',
        category: 'Edit',
        icon: '↷',
        defaultKeybinding: 'Ctrl+Y',
        enabled: true,
        execute: (context) => {
            // Hook into editor redo
        }
    }
];
