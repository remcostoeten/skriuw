import { TCommand } from '../types';

export const fileCommands: TCommand[] = [
    {
        id: 'file.new',
        label: 'New Note',
        description: 'Create a new note',
        category: 'File',
        icon: '📄',
        defaultKeybinding: 'Ctrl+N',
        enabled: true,
        execute: async (context) => {
            // Implementation will hook into existing note creation logic
            console.log('Create new note')
        }
    },
    {
        id: 'file.save',
        label: 'Save Note',
        description: 'Save the current note',
        category: 'File',
        icon: '💾',
        defaultKeybinding: 'Ctrl+S',
        enabled: true,
        when: (context) => !!context.activeNoteId,
        execute: async (context) => {
            console.log('Save note', context.activeNoteId)
        }
    }
];
