import { noop } from "@/shared/lib/noop";

const KEY = "skriuw-jump-debug";

/** Temporary diagnostic for the mod+g investigation. Delete with its probes. */
export function jumpDebug(message: string): void {
  try {
    const previous = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
    previous.push(`${new Date().toISOString()} ${message}`);
    window.localStorage.setItem(KEY, JSON.stringify(previous.slice(-60)));
  } catch {
    noop();
  }
}

export function installJumpKeyProbe(host: HTMLElement | null): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "g") return;
    const target = event.target as HTMLElement | null;
    jumpDebug(
      `keydown g ctrl=${event.ctrlKey} meta=${event.metaKey} alt=${event.altKey} ` +
        `target=${target?.tagName ?? "none"} editable=${target?.isContentEditable ?? "n/a"} ` +
        `hostPresent=${host !== null} hostContainsTarget=${host && target ? host.contains(target) : "n/a"} ` +
        `defaultPrevented=${event.defaultPrevented}`,
    );
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
