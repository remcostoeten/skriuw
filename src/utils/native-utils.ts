/**
 * Cross-platform native utilities
 * Works in both web and Tauri environments
 */

// Check if we're running in Tauri
export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Lazy load Tauri APIs only when needed
const loadTauriAPIs = async () => {
  if (!isTauri) return null;

  try {
    const [dialog, tauriWindow] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/window')
    ]);

    return { dialog, tauriWindow };
  } catch (error) {
    console.warn('Failed to load Tauri APIs:', error);
    return null;
  }
};

/**
 * Native Dialogs
 */
export interface DialogOptions {
  title?: string;
  message?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface DialogResult {
  path?: string;
  success: boolean;
  cancelled: boolean;
}

export class NativeDialogs {
  /**
   * Show a file save dialog
   */
  static async saveFile(options: DialogOptions = {}): Promise<DialogResult> {
    if (!isTauri) {
      // Web fallback: use download link
      return this.webSaveFile(options);
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) throw new Error('Tauri APIs not available');

      const selected = await apis.dialog.save({
        title: options.title || 'Save File',
        defaultPath: options.defaultPath,
        filters: options.filters || [
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      return {
        path: selected,
        success: !!selected,
        cancelled: !selected
      };
    } catch (error) {
      console.error('Failed to open save dialog:', error);
      return { success: false, cancelled: true };
    }
  }

  /**
   * Show a file open dialog
   */
  static async openFile(options: DialogOptions = {}): Promise<DialogResult> {
    if (!isTauri) {
      // Web fallback: use file input
      return this.webOpenFile(options);
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) throw new Error('Tauri APIs not available');

      const selected = await apis.dialog.open({
        title: options.title || 'Open File',
        defaultPath: options.defaultPath,
        multiple: false,
        filters: options.filters || [
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      return {
        path: Array.isArray(selected) ? selected[0] : selected,
        success: !!selected,
        cancelled: !selected
      };
    } catch (error) {
      console.error('Failed to open file dialog:', error);
      return { success: false, cancelled: true };
    }
  }

  /**
   * Show a confirmation dialog
   */
  static async confirm(
    message: string,
    title?: string,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel'
  ): Promise<boolean> {
    if (!isTauri) {
      // Web fallback: use browser confirm
      return window.confirm(message);
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) throw new Error('Tauri APIs not available');

      const confirmed = await apis.dialog.ask(message, {
        title: title || 'Confirm',
        type: 'info',
        okLabel: confirmLabel,
        cancelLabel
      });

      return confirmed;
    } catch (error) {
      console.error('Failed to show confirm dialog:', error);
      return false;
    }
  }

  /**
   * Show an alert dialog
   */
  static async alert(message: string, title?: string): Promise<void> {
    if (!isTauri) {
      // Web fallback: use browser alert
      window.alert(message);
      return;
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) throw new Error('Tauri APIs not available');

      await apis.dialog.message(message, { title: title || 'Alert' });
    } catch (error) {
      console.error('Failed to show alert dialog:', error);
      window.alert(message); // Fallback
    }
  }

  private static webSaveFile(options: DialogOptions): Promise<DialogResult> {
    return new Promise((resolve) => {
      // Create a temporary file input for web fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = (options.filters || []).map(f => `.${f.extensions.join(',')}`).join(',');

      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        resolve({
          path: file?.name,
          success: !!file,
          cancelled: !file
        });
      };

      input.oncancel = () => {
        resolve({ success: false, cancelled: true });
      };

      input.click();
    });
  }

  private static webOpenFile(options: DialogOptions): Promise<DialogResult> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = (options.filters || []).map(f => `.${f.extensions.join(',')}`).join(',');

      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        resolve({
          path: file?.name,
          success: !!file,
          cancelled: !file
        });
      };

      input.oncancel = () => {
        resolve({ success: false, cancelled: true });
      };

      input.click();
    });
  }
}

/**
 * Window Management
 */
export class WindowManager {
  /**
   * Minimize the window
   */
  static async minimize(): Promise<void> {
    if (!isTauri) return;

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();
      await currentWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }

  /**
   * Maximize the window
   */
  static async maximize(): Promise<void> {
    if (!isTauri) return;

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();
      await currentWindow.toggleMaximize();
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  }

  /**
   * Close the window
   */
  static async close(): Promise<void> {
    if (!isTauri) {
      window.close();
      return;
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();
      await currentWindow.close();
    } catch (error) {
      console.error('Failed to close window:', error);
      window.close(); // Fallback
    }
  }

  /**
   * Set window title
   */
  static async setTitle(title: string): Promise<void> {
    if (!isTauri) {
      document.title = title;
      return;
    }

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();
      await currentWindow.setTitle(title);
      document.title = title; // Also update document title
    } catch (error) {
      console.error('Failed to set window title:', error);
      document.title = title; // Fallback
    }
  }

  /**
   * Set window always on top
   */
  static async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    if (!isTauri) return;

    try {
      const apis = await loadTauriAPIs();
      if (!apis) return;

      const currentWindow = apis.tauriWindow.getCurrent();
      await currentWindow.setAlwaysOnTop(alwaysOnTop);
    } catch (error) {
      console.error('Failed to set always on top:', error);
    }
  }
}

/**
 * System Utilities
 */
export class SystemUtils {
  /**
   * Get platform information
   */
  static async getPlatform(): Promise<string> {
    if (!isTauri) {
      return navigator.platform;
    }

    try {
      const { app } = await import('@tauri-apps/api/app');
      return await app.getName();
    } catch (error) {
      console.error('Failed to get platform info:', error);
      return navigator.platform;
    }
  }

  /**
   * Show system notification
   */
  static async showNotification(
    title: string,
    body: string,
    icon?: string
  ): Promise<void> {
    if (!isTauri) {
      // Web fallback: use browser notification API
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification(title, { body, icon });
            }
          });
        }
      }
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('show_notification', { title, body, icon });
    } catch (error) {
      console.error('Failed to show notification:', error);
      // Fallback to web notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon });
      }
    }
  }
}

/**
 * Export all utilities as a single object for convenience
 */
export const NativeUtils = {
  Dialogs: NativeDialogs,
  Window: WindowManager,
  System: SystemUtils,
  isTauri
};