/** Removes renderer-only Skriuw state without disturbing other apps on the origin. */
export function clearSkriuwLocalState(storage?: Storage): void {
  try {
    const area = storage ?? globalThis.localStorage;
    for (let index = area.length - 1; index >= 0; index -= 1) {
      const key = area.key(index);
      if (key?.startsWith("skriuw")) {
        area.removeItem(key);
      }
    }
  } catch {
    // The durable stores are still cleared when a webview blocks localStorage.
  }
}
