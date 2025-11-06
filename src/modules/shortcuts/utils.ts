/**
 * Shortcut Utilities
 * Shared functions for matching and handling shortcuts
 */

/**
 * Parse shortcut combo string to match keyboard event
 */
export function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+').map(p => p.trim())
  const key = parts[parts.length - 1]

  // Check key
  if (event.key.toLowerCase() !== key.toLowerCase()) return false

  // Check modifiers
  const hasCtrl = parts.some(p => p === 'ctrl' || p === 'cmdorctrl')
  const hasShift = parts.some(p => p === 'shift')
  const hasAlt = parts.some(p => p === 'alt')
  const hasMeta = parts.some(p => p === 'cmd' || p === 'meta')

  // Handle CmdOrCtrl (Mac = Meta, others = Ctrl)
  const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
  const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey

  if (hasCtrl || hasMeta) {
    if (!ctrlOrCmd) return false
  } else {
    if (event.ctrlKey || event.metaKey) return false
  }

  if (hasShift && !event.shiftKey) return false
  if (!hasShift && event.shiftKey) return false
  if (hasAlt && !event.altKey) return false
  if (!hasAlt && event.altKey) return false

  return true
}

/**
 * Check if we should prevent shortcut (e.g., when typing in input)
 */
export function shouldPreventShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    (target as any).role === 'textbox'
  ) {
    // Only allow shortcuts with modifiers
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey
    return !hasModifier
  }
  return false
}

