type BrowserBridgeRequest = {
  type: "invoke";
  id: number;
  command: string;
  args: unknown;
};

type BrowserBridgeResponse = {
  type: "response";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
};

const worker = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<BrowserBridgeRequest>) => void) | null;
  postMessage(message: BrowserBridgeResponse): void;
};

/**
 * Browser storage worker seam. The SQLite-WASM/OPFS adapter will register the
 * command implementations here; keeping the protocol in place now prevents
 * renderer code from acquiring browser-specific persistence assumptions.
 */
worker.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== "invoke") return;
  worker.postMessage({
    type: "response",
    id: request.id,
    ok: false,
    error: `Browser storage adapter is not available yet (${request.command})`,
  });
};

