/**
 * Accepts a code the user typed or pasted in any grouping and case, and
 * returns the canonical form the backend parses. Only the alphabet's symbols
 * survive, so pasted whitespace and stray separators are harmless.
 */
export function normalizeRecoveryCodeInput(value: string): string {
  const symbols = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 32);
  return (symbols.match(/.{1,4}/g) ?? []).join("-");
}

export function recoveryCodeLooksComplete(value: string): boolean {
  return value.replace(/[^0-9A-Za-z]/g, "").length === 32;
}
