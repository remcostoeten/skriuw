/**
 * Cross-platform dock/taskbar utilities
 * Works in both web and Tauri environments
 */

import { isTauri } from './native-utils';

// Lazy load Tauri APIs only when needed
const loadTauriAPIs = async () => {
  if (!isTauri) return null;

  try {
    const [tauriWindow] = await Promise.all([
      import('@tauri-apps/api/window')
    ]);

    return { tauriWindow };
  } catch (error) {
    console.warn('Failed to load Tauri APIs:', error);
    return null;
  }
};

export interface DockOptions {
  /** Badge text or number to display */
  badge?: string | number;
  /** Progress value between 0 and 1 */
  progress?: number;
  /** Window should flash in taskbar */
  flash?: boolean;
  /** Window should be highlighted */
  highlight?: boolean;
}

export class DockManager {
  /**
   * Set the dock/taskbar badge
   */
  static async setBadge(badge: string | number): Promise<void> {
    if (!isTauri) {
      // Web fallback: update document title with badge (client-side only)
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const originalTitle = document.title;
        if (badge && badge !== 0) {
          document.title = `(${badge}) ${originalTitle}`;
        } else {
          // Remove badge from title if it exists
          document.title = originalTitle.replace(/^\(\d+\)\s*/, '');
        }
      }
      return;
    }

    try {
      // Note: Badge functionality may require additional Tauri plugins
      // For now, we'll update the window title as a fallback
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();
      const originalTitle = await currentWindow.title();

      if (badge && badge !== 0) {
        await currentWindow.setTitle(`(${badge}) ${originalTitle}`);
      } else {
        await currentWindow.setTitle(originalTitle.replace(/^\(\d+\)\s*/, ''));
      }
    } catch (error) {
      console.error('Failed to set dock badge:', error);
    }
  }

  /**
   * Clear the dock/taskbar badge
   */
  static async clearBadge(): Promise<void> {
    await this.setBadge('');
  }

  /**
   * Set progress indicator in dock/taskbar
   */
  static async setProgress(progress: number): Promise<void> {
    if (!isTauri) {
      // Web fallback: update favicon or show visual indicator (client-side only)
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--app-progress', `${Math.max(0, Math.min(1, progress))}`);
      }
      return;
    }

    try {
      // Note: Progress functionality may require additional Tauri plugins
      const apis = await loadTauriAPIs();
      if (!apis) return;

      // Store progress in window state for potential future use
      const currentWindow = apis.tauriWindow.getCurrent();
      // This is a placeholder - actual progress bar implementation would depend on Tauri plugins
      console.log('Setting dock progress:', progress);
    } catch (error) {
      console.error('Failed to set dock progress:', error);
    }
  }

  /**
   * Clear progress indicator
   */
  static async clearProgress(): Promise<void> {
    await this.setProgress(0);
  }

  /**
   * Make the window flash in the taskbar
   */
  static async flashWindow(flash = true): Promise<void> {
    if (!isTauri) {
      // Web fallback: flash browser tab title (client-side only)
      if (flash && typeof window !== 'undefined' && typeof document !== 'undefined') {
        let flashCount = 0;
        const originalTitle = document.title;
        const flashInterval = setInterval(() => {
          document.title = flashCount % 2 === 0 ? '✨ New Activity!' : originalTitle;
          flashCount++;
          if (flashCount >= 6) {
            clearInterval(flashInterval);
            document.title = originalTitle;
          }
        }, 500);
      }
      return;
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();

      if (flash) {
        // Request user attention
        await currentWindow.requestUserAttention();
      } else {
        // Clear attention request
        await currentWindow.clearAttention();
      }
    } catch (error) {
      console.error('Failed to flash window:', error);
    }
  }

  /**
   * Highlight the window in the dock/taskbar
   */
  static async highlightWindow(highlight = true): Promise<void> {
    if (!isTauri) {
      // Web fallback: focus the window (client-side only)
      if (highlight && typeof window !== 'undefined') {
        window.focus();
      }
      return;
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();

      if (highlight) {
        // Focus and bring to front
        await currentWindow.setFocus();
        await currentWindow.unminimize();
      }
    } catch (error) {
      console.error('Failed to highlight window:', error);
    }
  }

  /**
   * Set multiple dock properties at once
   */
  static async updateDock(options: DockOptions): Promise<void> {
    const promises: Promise<void>[] = [];

    if (options.badge !== undefined) {
      promises.push(this.setBadge(options.badge));
    }

    if (options.progress !== undefined) {
      promises.push(this.setProgress(options.progress));
    }

    if (options.flash) {
      promises.push(this.flashWindow(true));
    }

    if (options.highlight) {
      promises.push(this.highlightWindow(true));
    }

    await Promise.all(promises);
  }

  /**
   * Get current dock state
   */
  static async getDockState(): Promise<Partial<DockOptions>> {
    // This would require additional APIs to read current state
    // For now, return empty object
    return {};
  }

  /**
   * Update dock based on application state
   */
  static async updateFromAppState(state: {
    unreadCount?: number;
    progress?: number;
    hasNewActivity?: boolean;
    isActive?: boolean;
  }): Promise<void> {
    const options: DockOptions = {};

    if (state.unreadCount !== undefined) {
      options.badge = state.unreadCount > 0 ? state.unreadCount : '';
    }

    if (state.progress !== undefined) {
      options.progress = state.progress;
    }

    if (state.hasNewActivity) {
      options.flash = true;
    }

    if (state.isActive === false) {
      options.highlight = false;
    }

    await this.updateDock(options);
  }
}

/**
 * Convenience hook for dock management
 */
export function useDockManager() {
  const setBadge = (badge: string | number) => DockManager.setBadge(badge);
  const clearBadge = () => DockManager.clearBadge();
  const setProgress = (progress: number) => DockManager.setProgress(progress);
  const clearProgress = () => DockManager.clearProgress();
  const flashWindow = (flash = true) => DockManager.flashWindow(flash);
  const highlightWindow = (highlight = true) => DockManager.highlightWindow(highlight);
  const updateDock = (options: DockOptions) => DockManager.updateDock(options);
  const updateFromAppState = (state: Parameters<typeof DockManager.updateFromAppState>[0]) =>
    DockManager.updateFromAppState(state);

  return {
    setBadge,
    clearBadge,
    setProgress,
    clearProgress,
    flashWindow,
    highlightWindow,
    updateDock,
    updateFromAppState,
    isNative: isTauri
  };
}

/**
 * Export all utilities as a single object for convenience
 */
export const DockUtils = {
  DockManager,
  useDockManager,
  isTauri
};