const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset"]);

/**
 * @name isTypingTarget
 * @description True when a key press lands in a field that takes text, where
 * the tasks view's single-letter keys must not fire. Checkboxes and buttons do
 * not count, so the keys still work from a focused row.
 *
 * @example
 * if (isTypingTarget(event.target)) return;
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}
