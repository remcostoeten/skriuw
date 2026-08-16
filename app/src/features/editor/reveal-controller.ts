export type BlockRevealRequest = {
  noteId: string;
  blockId: string;
};

let pending: BlockRevealRequest | null = null;
let listener: (() => void) | null = null;

/**
 * Registers the editor's reveal handler. The handler serves whatever
 * {@link takePendingBlockReveal} hands it for the note it currently shows, so a
 * request made while another note is open waits for the switch instead of
 * being dropped.
 */
export function registerBlockReveal(handler: () => void): () => void {
  listener = handler;
  if (pending) {
    handler();
  }
  return () => {
    if (listener === handler) {
      listener = null;
    }
  };
}

/** Asks the editor to reveal a block; the caller navigates to the note itself. */
export function requestBlockReveal(noteId: string, blockId: string): void {
  pending = { noteId, blockId };
  listener?.();
}

export function takePendingBlockReveal(noteId: string | null): string | null {
  if (noteId === null || pending === null || pending.noteId !== noteId) {
    return null;
  }
  const { blockId } = pending;
  pending = null;
  return blockId;
}
