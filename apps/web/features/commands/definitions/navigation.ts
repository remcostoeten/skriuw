import { TCommand } from '../types';

export const navigationCommands: TCommand[] = [
    {
        id: 'editor-focus',
        label: 'Focus Editor',
        category: 'Navigation',
        defaultKeybinding: '/',
        enabled: true,
        execute: () => console.log('Focus Editor')
    },
    {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        category: 'Navigation',
        defaultKeybinding: 'Ctrl+B',
        enabled: true,
        execute: () => console.log('Toggle Sidebar')
    },
    {
        id: 'open-settings',
        label: 'Open Settings',
        category: 'Navigation',
        defaultKeybinding: 'Ctrl+,',
        enabled: true,
        execute: () => console.log('Open Settings')
    },
    {
        id: 'open-collection',
        label: 'Open Collection',
        category: 'Navigation',
        defaultKeybinding: 'Ctrl+O',
        enabled: true,
        execute: () => console.log('Open Collection')
    }
];
