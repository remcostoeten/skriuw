import type { AiCompletionEvent } from "@/contracts/ai";

export type AiCompletionConsumer = {
  accept: (event: AiCompletionEvent) => boolean;
  dispose: () => void;
};

export type AiCompletionConsumerCallbacks = {
  onDelta: (text: string) => void;
  onTerminal: (event: Exclude<AiCompletionEvent, { type: "delta" }>) => void;
};

export function createAiCompletionConsumer(
  requestId: string,
  callbacks: AiCompletionConsumerCallbacks,
): AiCompletionConsumer {
  let active = true;
  let nextSequence = 0;

  return {
    accept(event): boolean {
      if (!active || event.requestId !== requestId) return false;
      if (event.type === "delta") {
        if (event.sequence !== nextSequence) return false;
        nextSequence += 1;
        callbacks.onDelta(event.text);
        return true;
      }
      active = false;
      callbacks.onTerminal(event);
      return true;
    },
    dispose(): void {
      active = false;
    },
  };
}
