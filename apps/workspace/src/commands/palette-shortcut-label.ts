import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";

/**
 * @name paletteShortcutLabel
 * @description Formats a binding for display in the palette, one step per
 * key sequence, so `g then m` reads as two presses instead of one word.
 * @example paletteShortcutLabel("g then m") // "G M"
 */
export function paletteShortcutLabel(keys: string): string {
  return keys
    .split(" then ")
    .map((step) => formatShortcut(step))
    .join(" ");
}
