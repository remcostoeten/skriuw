export type RemoteImageChoice = "download" | "block";

export type RemoteImagePromptRequest = {
  sources: readonly string[];
  resolve: (choice: RemoteImageChoice | null) => void;
};

type Listener = (request: RemoteImagePromptRequest) => void;

let listener: Listener | null = null;

export function registerRemoteImagePromptListener(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * @name requestRemoteImageChoice
 * @description Asks whether an import may download the remote images its
 * Markdown links to, listing each distinct address. Resolves null when the dialog is dismissed or no host is
 * mounted, which callers treat as "keep blocked, ask again next time".
 *
 * @example
 * const choice = await requestRemoteImageChoice(["https://img.shields.io/badge/a.svg"]);
 */
export function requestRemoteImageChoice(
  sources: readonly string[],
): Promise<RemoteImageChoice | null> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(null);
      return;
    }
    listener({ sources, resolve });
  });
}
