import { TCommand } from '../types';

export const splitViewCommands: TCommand[] = [
    {
        id: 'toggle-split-view',
        label: 'Toggle Split View',
        category: 'View',
        defaultKeybinding: 'Ctrl+\\',
        enabled: true,
        execute: () => console.log('Toggle Split')
    },
    {
        id: 'swap-split-panes',
        label: 'Swap Panes',
        category: 'View',
        defaultKeybinding: 'Ctrl+Shift+\\',
        enabled: true,
        execute: () => console.log('Swap Panes')
    },
    {
        id: 'cycle-split-orientation',
        label: 'Cycle Orientation',
        category: 'View',
        defaultKeybinding: 'Ctrl+Alt+O',
        enabled: true,
        execute: () => console.log('Cycle Orientation')
    },
    {
        id: 'split.focus.left',
        label: 'Focus Left Pane',
        category: 'View',
        defaultKeybinding: 'Ctrl+Alt+ArrowLeft',
        enabled: true,
        execute: () => console.log('Focus Left')
    },
    {
        id: 'split.focus.right',
        label: 'Focus Right Pane',
        category: 'View',
        defaultKeybinding: 'Ctrl+Alt+ArrowRight',
        enabled: true,
        execute: () => console.log('Focus Right')
    },
    {
        id: 'split.close',
        label: 'Close Active Pane',
        category: 'View',
        defaultKeybinding: 'Ctrl+Alt+W',
        enabled: true,
        execute: () => console.log('Close Pane')
    }
];
