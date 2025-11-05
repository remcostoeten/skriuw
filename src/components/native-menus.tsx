/**
 * Cross-platform native menu system
 * Works in both web and Tauri environments
 */

import { isTauri } from '@/utils/native-utils';
import { useCallback, useEffect } from 'react';

export type MenuItemType = 'separator' | 'submenu' | 'item';

export interface NativeMenuItem {
  id: string;
  label: string;
  type: MenuItemType;
  accelerator?: string;
  action?: () => void;
  submenu?: NativeMenuItem[];
  enabled?: boolean;
  checked?: boolean;
}

export interface MenuConfig {
  id: string;
  items: NativeMenuItem[];
}

export const defaultAppMenu: MenuConfig[] = [
  {
    id: 'file',
    items: [
      {
        id: 'new-note',
        label: 'New Note',
        type: 'item',
        accelerator: 'CmdOrCtrl+N',
        action: () => {
          // This will be provided by the parent component
          window.dispatchEvent(new CustomEvent('menu:new-note'));
        }
      },
      {
        id: 'open-file',
        label: 'Open...',
        type: 'item',
        accelerator: 'CmdOrCtrl+O',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:open-file'));
        }
      },
      { id: 'separator1', label: '-', type: 'separator' },
      {
        id: 'save',
        label: 'Save',
        type: 'item',
        accelerator: 'CmdOrCtrl+S',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:save'));
        }
      },
      {
        id: 'save-as',
        label: 'Save As...',
        type: 'item',
        accelerator: 'CmdOrCtrl+Shift+S',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:save-as'));
        }
      },
      { id: 'separator2', label: '-', type: 'separator' },
      {
        id: 'export',
        label: 'Export',
        type: 'submenu',
        submenu: [
          {
            id: 'export-markdown',
            label: 'Markdown',
            type: 'item',
            action: () => {
              window.dispatchEvent(new CustomEvent('menu:export-markdown'));
            }
          },
          {
            id: 'export-pdf',
            label: 'PDF',
            type: 'item',
            action: () => {
              window.dispatchEvent(new CustomEvent('menu:export-pdf'));
            }
          },
          {
            id: 'export-html',
            label: 'HTML',
            type: 'item',
            action: () => {
              window.dispatchEvent(new CustomEvent('menu:export-html'));
            }
          }
        ]
      },
      { id: 'separator3', label: '-', type: 'separator' },
      {
        id: 'quit',
        label: 'Quit',
        type: 'item',
        accelerator: 'CmdOrCtrl+Q',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:quit'));
        }
      }
    ]
  },
  {
    id: 'edit',
    items: [
      {
        id: 'undo',
        label: 'Undo',
        type: 'item',
        accelerator: 'CmdOrCtrl+Z',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:undo'));
        }
      },
      {
        id: 'redo',
        label: 'Redo',
        type: 'item',
        accelerator: 'CmdOrCtrl+Shift+Z',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:redo'));
        }
      },
      { id: 'separator1', label: '-', type: 'separator' },
      {
        id: 'cut',
        label: 'Cut',
        type: 'item',
        accelerator: 'CmdOrCtrl+X',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:cut'));
        }
      },
      {
        id: 'copy',
        label: 'Copy',
        type: 'item',
        accelerator: 'CmdOrCtrl+C',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:copy'));
        }
      },
      {
        id: 'paste',
        label: 'Paste',
        type: 'item',
        accelerator: 'CmdOrCtrl+V',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:paste'));
        }
      },
      {
        id: 'select-all',
        label: 'Select All',
        type: 'item',
        accelerator: 'CmdOrCtrl+A',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:select-all'));
        }
      },
      { id: 'separator2', label: '-', type: 'separator' },
      {
        id: 'find',
        label: 'Find',
        type: 'item',
        accelerator: 'CmdOrCtrl+F',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:find'));
        }
      },
      {
        id: 'replace',
        label: 'Replace',
        type: 'item',
        accelerator: 'CmdOrCtrl+H',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:replace'));
        }
      }
    ]
  },
  {
    id: 'view',
    items: [
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        type: 'item',
        accelerator: 'CmdOrCtrl+B',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:toggle-sidebar'));
        }
      },
      { id: 'separator1', label: '-', type: 'separator' },
      {
        id: 'zoom-in',
        label: 'Zoom In',
        type: 'item',
        accelerator: 'CmdOrCtrl+Plus',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:zoom-in'));
        }
      },
      {
        id: 'zoom-out',
        label: 'Zoom Out',
        type: 'item',
        accelerator: 'CmdOrCtrl+-',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:zoom-out'));
        }
      },
      {
        id: 'reset-zoom',
        label: 'Actual Size',
        type: 'item',
        accelerator: 'CmdOrCtrl+0',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:reset-zoom'));
        }
      },
      { id: 'separator2', label: '-', type: 'separator' },
      {
        id: 'always-on-top',
        label: 'Always on Top',
        type: 'item',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:always-on-top'));
        }
      }
    ]
  },
  {
    id: 'window',
    items: [
      {
        id: 'minimize',
        label: 'Minimize',
        type: 'item',
        accelerator: 'CmdOrCtrl+M',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:minimize'));
        }
      },
      {
        id: 'maximize',
        label: 'Maximize',
        type: 'item',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:maximize'));
        }
      },
      { id: 'separator1', label: '-', type: 'separator' },
      {
        id: 'close-tab',
        label: 'Close Tab',
        type: 'item',
        accelerator: 'CmdOrCtrl+W',
        action: () => {
          window.dispatchEvent(new CustomEvent('menu:close-tab'));
        }
      }
    ]
  }
];

/**
 * Native Menu Manager Hook
 */
export function useNativeMenus(
  customMenus?: MenuConfig[],
  onMenuAction?: (actionId: string) => void
) {
  const setupMenus = useCallback(async () => {
    if (!isTauri) {
      // Web fallback: setup keyboard shortcuts
      setupWebKeyboardShortcuts(customMenus || defaultAppMenu, onMenuAction);
      return;
    }

    try {
      // Note: Menu functionality may require additional Tauri plugins
      // For now, we'll focus on keyboard shortcuts which work cross-platform
      console.log('Setting up native menus (keyboard shortcuts only for now)');

      // Setup keyboard shortcuts
      setupKeyboardShortcuts(customMenus || defaultAppMenu, onMenuAction);
    } catch (error) {
      console.error('Failed to setup native menus:', error);
      // Fallback to web shortcuts
      setupWebKeyboardShortcuts(customMenus || defaultAppMenu, onMenuAction);
    }
  }, [customMenus, onMenuAction]);

  useEffect(() => {
    setupMenus();
  }, [setupMenus]);

  return {
    setupMenus,
    isNative: isTauri
  };
}

/**
 * Create Tauri menu from menu config
 */
async function createTauriMenu(
  menuConfig: MenuConfig,
  apis: any
): Promise<any> {
  const { MenuItem, Submenu } = apis;

  const items = menuConfig.items.map(item => {
    if (item.type === 'separator') {
      return { type: 'separator' };
    }

    if (item.type === 'submenu' && item.submenu) {
      return Submenu.new({
        label: item.label,
        items: item.submenu.map(subItem => createTauriMenuItem(subItem, apis))
      });
    }

    return createTauriMenuItem(item, apis);
  });

  return items;
}

function createTauriMenuItem(item: NativeMenuItem, apis: any): any {
  const { MenuItem } = apis;

  return MenuItem.new({
    text: item.label,
    accelerator: item.accelerator,
    enabled: item.enabled !== false,
    action: item.action || (() => {
      window.dispatchEvent(new CustomEvent(`menu:${item.id}`));
    })
  });
}

/**
 * Setup keyboard shortcuts for both web and Tauri
 */
function setupKeyboardShortcuts(
  menus: MenuConfig[],
  onMenuAction?: (actionId: string) => void
) {
  const shortcuts: Record<string, string> = {};

  menus.forEach(menu => {
    menu.items.forEach(item => {
      if (item.accelerator && item.action) {
        const key = normalizeAccelerator(item.accelerator);
        shortcuts[key] = item.id;
      }
    });
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = getKeyCombo(e);
    const actionId = shortcuts[key];

    if (actionId) {
      e.preventDefault();
      e.stopPropagation();

      // Trigger the custom event
      window.dispatchEvent(new CustomEvent(`menu:${actionId}`));

      // Call the callback if provided
      if (onMenuAction) {
        onMenuAction(actionId);
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Setup web-specific keyboard shortcuts
 */
function setupWebKeyboardShortcuts(
  menus: MenuConfig[],
  onMenuAction?: (actionId: string) => void
) {
  return setupKeyboardShortcuts(menus, onMenuAction);
}

/**
 * Normalize accelerator string to key combo
 */
function normalizeAccelerator(accelerator: string): string {
  return accelerator
    .toLowerCase()
    .replace(/cmdorctrl/g, 'ctrl')
    .replace(/\s+/g, '');
}

/**
 * Get key combo from keyboard event
 */
function getKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];

  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  parts.push(e.key.toLowerCase());

  return parts.join('');
}

/**
 * Context Menu Hook (simplified for now)
 */
export function useContextMenu(
  menuItems: NativeMenuItem[],
  onMenuAction?: (actionId: string) => void
) {
  const showContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    // For now, just prevent default context menu
    // Full context menu implementation can be added later
    console.log('Context menu requested:', menuItems);
  }, [menuItems]);

  return { showContextMenu };
}
