import { Channel } from "@tauri-apps/api/core";
import type { AiCompletionEvent, AiCompletionRequest } from "@/contracts/ai";
import { invoke, requireDesktopRuntime } from "@/bridge/runtime";
import { noop } from "@/shared/lib/noop";

export type AiCompletionHandle = {
  cancel: () => Promise<boolean>;
  dispose: () => void;
};

export async function startAiCompletion(
  request: AiCompletionRequest,
  onEvent: (event: AiCompletionEvent) => void,
  signal?: AbortSignal,
): Promise<AiCompletionHandle> {
  requireDesktopRuntime("AI completion");
  if (signal?.aborted) {
    throw new DOMException("AI completion was cancelled.", "AbortError");
  }

  let active = true;
  const channel = new Channel<AiCompletionEvent>();
  channel.onmessage = (event) => {
    if (active) onEvent(event);
  };

  function cancel(): Promise<boolean> {
    return invoke<boolean>("cancel_ai_completion", { requestId: request.requestId });
  }

  const abort = () => {
    active = false;
    void cancel().catch(noop);
  };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    await invoke<void>("start_ai_completion", { request, onEvent: channel });
    if (signal?.aborted) await cancel();
  } catch (error) {
    signal?.removeEventListener("abort", abort);
    throw error;
  }

  return {
    cancel,
    dispose(): void {
      active = false;
      signal?.removeEventListener("abort", abort);
      void cancel().catch(noop);
    },
  };
}
