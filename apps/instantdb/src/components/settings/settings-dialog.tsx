'use client';

import { useUserSetting } from '@/hooks/use-user-setting';
import { ThemeSelector } from './theme-selector';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Settings Dialog Component
 *
 * Placeholder component for settings UI.
 * User will provide the modal UI design later.
 *
 * This component displays various user settings/feature flags:
 * - Theme selection (light/dark/system)
 * - Allow delete without context menu toggle
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [allowDeleteWithoutContextMenu, setAllowDeleteWithoutContextMenu] = useUserSetting<boolean>(
    'allowDeleteWithoutContextMenu',
    false
  );

  // Placeholder UI - will be replaced with actual design
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-6">Settings</h2>

        <div className="space-y-6">
          {/* Theme Selection */}
          <ThemeSelector />

          {/* Delete Shortcut Setting */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Keyboard Shortcuts</label>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-accent/50">
              <input
                type="checkbox"
                checked={allowDeleteWithoutContextMenu}
                onChange={(e) => setAllowDeleteWithoutContextMenu(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">
                Allow deleting with Shift+Backspace even if context menu is not open
              </span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

