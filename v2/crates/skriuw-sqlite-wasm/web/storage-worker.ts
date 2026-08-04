// `scripts/build-browser-wasm.sh` produces this ignored build artifact before
// typechecking or bundling the application.
import initWasm, {
  dispatch,
  initialize,
} from "../../../.build/browser-wasm/skriuw_sqlite_wasm.js";

type WorkerRequest = {
  protocolVersion: number;
  requestId: number;
  kind: string;
  payload?: unknown;
};

const worker = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(value: unknown): void;
  close(): void;
};

let initialized = false;
let terminal = false;
let queue = initWasm()
  .then(() => undefined)
  .catch(() => {
    terminal = true;
  });

worker.onmessage = (event) => {
  const request = event.data;
  queue = queue.then(async () => {
    if (terminal) {
      postTerminal(request?.requestId ?? 0);
      return;
    }
    try {
      const json = JSON.stringify(request);
      const response = !initialized ? await initialize(json) : dispatch(json);
      const value = JSON.parse(response) as { status?: string };
      worker.postMessage(value);
      if (!initialized && request.kind === "initialize" && value.status === "ok") {
        initialized = true;
      }
      if (request.kind === "close") worker.close();
    } catch {
      terminal = true;
      postTerminal(request?.requestId ?? 0);
    }
  });
};

function postTerminal(requestId: number): void {
  worker.postMessage({
    protocolVersion: 1,
    requestId,
    status: "error",
    value: {
      code: "worker_crashed",
      message: "The browser storage worker failed.",
      recovery: "Reload Skriuw; accepted writes may already be durable.",
      terminal: true,
    },
  });
}
