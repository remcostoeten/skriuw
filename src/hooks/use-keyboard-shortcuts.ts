'use client';

import { useEffect, useRef } from 'react';

type ShortcutHandler = () => void;

type ShortcutConfig = {
  key: string; // e.g., 'f', 'n', '0'
  ctrlOrCmd?: boolean; // Whether to require Ctrl (Windows/Linux) or Cmd (Mac)
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
};

/**
 * Parse a shortcut string like "CmdOrCtrl+F" or "Ctrl+N" into a config
 */
function parseShortcut(shortcut: string): Omit<ShortcutConfig, 'handler'> {
  const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
  const key = parts[parts.length - 1];
  const hasCtrl = parts.some(p => p === 'ctrl');
  const hasShift = parts.some(p => p === 'shift');
  const hasAlt = parts.some(p => p === 'alt');
  const hasCmd = parts.some(p => p === 'cmd');
  const hasCmdOrCtrl = parts.some(p => p === 'cmdorctrl');

  return {
    key,
    ctrlOrCmd: hasCtrl || hasCmd || hasCmdOrCtrl,
    shift: hasShift,
    alt: hasAlt,
  };
}

/**
 * Check if the current platform is Mac
 */
function isMac(): boolean {
  if (typeof window === 'undefined') return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
         /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

/**
 * Check if a keyboard event matches a shortcut config
 */
function matchesShortcut(
  event: KeyboardEvent,
  config: Omit<ShortcutConfig, 'handler'>
): boolean {
  // Normalize keys - handle special cases
  let pressedKey = event.key.toLowerCase();
  let expectedKey = config.key.toLowerCase();

  // Handle number keys - event.key might be "0" or "Digit0"
  if (/^\d$/.test(expectedKey)) {
    // Expected is a digit, check if pressed key matches
    if (pressedKey !== expectedKey && pressedKey !== `digit${expectedKey}`) {
      return false;
    }
  } else {
    // Regular key comparison
    if (pressedKey !== expectedKey) {
      return false;
    }
  }

  // Check modifiers
  const isMacPlatform = isMac();
  const needsModifier = config.ctrlOrCmd ?? false;

  if (needsModifier) {
    // On Mac, check for Meta (Cmd), on others check for Ctrl
    const modifierPressed = isMacPlatform
      ? event.metaKey
      : event.ctrlKey;

    if (!modifierPressed) {
      return false;
    }
  } else {
    // If modifier is not required, ensure neither Ctrl nor Cmd is pressed
    if (event.ctrlKey || event.metaKey) {
      return false;
    }
  }

  // Check shift modifier
  if (config.shift && !event.shiftKey) return false;
  if (!config.shift && event.shiftKey) {
    // Shift is pressed but not required - only allow if we're requiring a modifier
    // (to avoid conflicts with normal typing)
    if (!needsModifier) {
      return false;
    }
  }

  // Check alt modifier
  if (config.alt && !event.altKey) return false;
  if (!config.alt && event.altKey) return false;

  return true;
}

/**
 * Hook to register keyboard shortcuts
 *
 * @example
 * useKeyboardShortcuts({
 *   'CmdOrCtrl+F': () => toggleSearch(),
 *   'CmdOrCtrl+N': () => createNote(),
 *   'CmdOrCtrl+0': () => toggleFolders(),
 * });
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, ShortcutHandler>
) {
  const shortcutsRef = useRef(shortcuts);
  const handlersRef = useRef<Map<string, ShortcutConfig>>(new Map());

  // Update shortcuts ref when they change
  useEffect(() => {
    shortcutsRef.current = shortcuts;

    // Parse and store shortcuts
    handlersRef.current.clear();
    Object.entries(shortcuts).forEach(([shortcutString, handler]) => {
      const config = parseShortcut(shortcutString);
      handlersRef.current.set(shortcutString, {
        ...config,
        handler,
      });
    });

    console.log('[KeyboardShortcuts] Registered shortcuts:', Object.keys(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable elements
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target as any).role === 'textbox'
      ) {
        // Allow shortcuts only if they include modifiers (to avoid interfering with typing)
        const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
        if (!hasModifier) {
          return;
        }
      }

      // Check each registered shortcut
      for (const [shortcutString, config] of handlersRef.current.entries()) {
        if (matchesShortcut(event, config)) {
          console.log('[KeyboardShortcuts] Matched shortcut:', shortcutString);
          event.preventDefault();
          event.stopPropagation();
          try {
            config.handler();
            console.log('[KeyboardShortcuts] Handler executed for:', shortcutString);
          } catch (error) {
            console.error('[KeyboardShortcuts] Error executing handler for:', shortcutString, error);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    console.log('[KeyboardShortcuts] Event listener attached');

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      console.log('[KeyboardShortcuts] Event listener removed');
    };
  }, []);
}

