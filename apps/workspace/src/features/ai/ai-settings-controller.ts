type Props = () => void;

let listener: Props | null = null;

export function registerAiSettings(next: Props): () => void {
  listener = next;
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Opens the AI section of settings from surfaces that live below the shell,
 * such as the editor's AI menu. Does nothing when no shell is mounted.
 */
export function requestAiSettings(): void {
  listener?.();
}
