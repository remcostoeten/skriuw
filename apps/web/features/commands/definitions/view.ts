import { TCommand } from '../types';

export const viewCommands: TCommand[] = [
    {
        id: 'view.toggleSidebar',
        label: 'Toggle Sidebar',
        category: 'View',
        icon: '📑',
        defaultKeybinding: 'Ctrl+B',
        enabled: true,
        execute: (context) => {
            // Hook into sidebar toggle
        }
    },
    {
        id: 'view.toggleTheme',
        label: 'Toggle Theme',
        category: 'View',
        icon: '🌓',
        defaultKeybinding: 'Alt+T',
        enabled: true,
        execute: (context) => {
            // Hook into theme toggle
        }
    },
    {
        id: 'view.commandPalette',
        label: 'Command Palette',
        category: 'View',
        icon: '#',
        defaultKeybinding: ['Ctrl+P', 'Meta+P'],
        enabled: true,
        execute: () => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('skriuw:palette:toggle'));
            }
        }
    }
];
