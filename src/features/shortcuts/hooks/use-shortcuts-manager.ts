import { useCallback, useEffect, useState } from 'react';

import { resetAllShortcuts } from '../api/mutations/reset-all-shortcuts';
import { resetShortcut } from '../api/mutations/reset-shortcut';
import { saveShortcut } from '../api/mutations/save-shortcut';
import { getShortcuts } from '../api/queries/get-shortcuts';
import { ShortcutId, KeyCombo } from '../shortcut-definitions';

/**
 * Hook to manage shortcuts programmatically
 * Useful for settings pages or advanced shortcut management
 */
export function useShortcutsManager() {
  const [customShortcuts, setCustomShortcuts] = useState<Partial<Record<ShortcutId, KeyCombo[]>>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadShortcuts = useCallback(async () => {
    setIsLoading(true);
    try {
      const shortcuts = await getShortcuts();
      setCustomShortcuts(shortcuts);
    } catch (error) {
      console.error('Failed to load shortcuts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShortcuts();
  }, [loadShortcuts]);

  const saveShortcutHandler = useCallback(async (id: ShortcutId, keys: KeyCombo[]) => {
    try {
      // Convert KeyCombo[] to string[] by joining each combo with '+'
      const stringKeys = keys.map(combo => combo.join('+'));
      await saveShortcut(id, stringKeys);
      await loadShortcuts();
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    } catch (error) {
      console.error('Failed to save shortcut:', error);
      throw error;
    }
  }, [loadShortcuts]);

  const resetShortcutHandler = useCallback(async (id: ShortcutId) => {
    try {
      await resetShortcut(id);
      await loadShortcuts();
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    } catch (error) {
      console.error('Failed to reset shortcut:', error);
      throw error;
    }
  }, [loadShortcuts]);

  const resetAllShortcutsHandler = useCallback(async () => {
    try {
      await resetAllShortcuts();
      await loadShortcuts();
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    } catch (error) {
      console.error('Failed to reset all shortcuts:', error);
      throw error;
    }
  }, [loadShortcuts]);

  return {
    customShortcuts,
    isLoading,
    saveShortcut: saveShortcutHandler,
    resetShortcut: resetShortcutHandler,
    resetAllShortcuts: resetAllShortcutsHandler,
    reload: loadShortcuts,
  };
}

