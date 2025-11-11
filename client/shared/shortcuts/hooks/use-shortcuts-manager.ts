import { useCallback, useEffect, useState } from 'react';
import { ShortcutId, KeyCombo } from '../shortcut-definitions';
import { getShortcutStorage } from '../api';

/**
 * Hook to manage shortcuts programmatically
 * Useful for settings pages or advanced shortcut management
 */
export function useShortcutsManager() {
  const [customShortcuts, setCustomShortcuts] = useState<Partial<Record<ShortcutId, KeyCombo[]>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const storage = getShortcutStorage();

  const loadShortcuts = useCallback(async () => {
    setIsLoading(true);
    try {
      const shortcuts = await storage.getCustomShortcuts();
      setCustomShortcuts(shortcuts);
    } catch (error) {
      console.error('Failed to load shortcuts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    loadShortcuts();
  }, [loadShortcuts]);

  const saveShortcut = useCallback(async (id: ShortcutId, keys: KeyCombo[]) => {
    try {
      await storage.saveCustomShortcut(id, keys);
      await loadShortcuts();
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    } catch (error) {
      console.error('Failed to save shortcut:', error);
      throw error;
    }
  }, [storage, loadShortcuts]);

  const resetShortcut = useCallback(async (id: ShortcutId) => {
    try {
      await storage.resetShortcut(id);
      await loadShortcuts();
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    } catch (error) {
      console.error('Failed to reset shortcut:', error);
      throw error;
    }
  }, [storage, loadShortcuts]);

  const resetAllShortcuts = useCallback(async () => {
    try {
      await storage.resetAllShortcuts();
      await loadShortcuts();
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    } catch (error) {
      console.error('Failed to reset all shortcuts:', error);
      throw error;
    }
  }, [storage, loadShortcuts]);

  return {
    customShortcuts,
    isLoading,
    saveShortcut,
    resetShortcut,
    resetAllShortcuts,
    reload: loadShortcuts,
  };
}

