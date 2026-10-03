/**
 * Vim key notation for keyboard events. Printable characters stand for
 * themselves; everything else uses the angle-bracket names Vim documents, so
 * key buffers, macros, and dot-repeat records read like a `.vimrc`.
 */
export type VimKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

const NAMED_KEYS: Record<string, string> = {
  Escape: "<Esc>",
  Enter: "<CR>",
  Backspace: "<BS>",
  Tab: "<Tab>",
  Delete: "<Del>",
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
  Home: "<Home>",
  End: "<End>",
  PageUp: "<PageUp>",
  PageDown: "<PageDown>",
  " ": "<Space>",
};

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "AltGraph",
  "Fn",
  "OS",
  "Hyper",
  "Super",
]);

/**
 * The Vim key for an event, or null when Vim should not see it: lone
 * modifiers, dead keys, and any combination with meta or alt held, which stay
 * with the application's own shortcuts.
 */
export function vimKeyFromEvent(event: VimKeyEvent): string | null {
  if (MODIFIER_KEYS.has(event.key) || event.key === "Dead" || event.key === "Unidentified") {
    return null;
  }
  if (event.metaKey || event.altKey) return null;
  if (event.ctrlKey) {
    if (event.key.length === 1) return `<C-${event.key.toLowerCase()}>`;
    if (event.key === "[") return "<Esc>";
    return null;
  }
  const named = NAMED_KEYS[event.key];
  if (named) return named;
  if (event.key.length === 1) return event.key;
  return null;
}

export function isPrintableKey(key: string): boolean {
  return key.length === 1 || key === "<Space>";
}

export function keyToCharacter(key: string): string | null {
  if (key === "<Space>") return " ";
  if (key === "<CR>") return "\n";
  if (key.length === 1) return key;
  return null;
}
