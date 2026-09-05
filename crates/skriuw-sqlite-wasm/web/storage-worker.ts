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
  skriuwSyncHttp(requestJson: string, body?: Uint8Array): SyncHttpResult;
  skriuwSyncEvent(eventJson: string): void;
};

type SyncHttpRequest = {
  method: string;
  url: string;
  token: string;
  timeoutMs: number;
  contentType?: string | null;
};

type SyncHttpResult = {
  status?: number;
  retryAfterMs?: number;
  body?: Uint8Array;
  transportFailure?: string;
};

// Dedicated workers may issue synchronous XHR, which lets the WASM sync
// coordinator reuse the native crate's synchronous transport boundary. Each
// call is one bounded request with its own deadline; the renderer never waits
// on this because it only ever awaits worker responses asynchronously.
worker.skriuwSyncHttp = (requestJson, body) => {
  let request: SyncHttpRequest;
  try {
    request = JSON.parse(requestJson) as SyncHttpRequest;
  } catch {
    return { transportFailure: "sync bridge received an unreadable request" };
  }
  const xhr = new XMLHttpRequest();
  try {
    xhr.open(request.method, request.url, false);
    xhr.responseType = "arraybuffer";
    xhr.timeout = request.timeoutMs;
    xhr.setRequestHeader("Authorization", `Bearer ${request.token}`);
    if (request.contentType) xhr.setRequestHeader("Content-Type", request.contentType);
    xhr.send(body ? (body.slice().buffer as ArrayBuffer) : null);
  } catch {
    return { transportFailure: "cloud sync request failed to reach the network" };
  }
  if (xhr.status === 0) {
    return { transportFailure: "cloud sync request received no response" };
  }
  const retryAfterHeader = xhr.getResponseHeader("Retry-After");
  const retryAfterSeconds = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
  return {
    status: xhr.status,
    ...(Number.isFinite(retryAfterSeconds)
      ? { retryAfterMs: retryAfterSeconds * 1_000 }
      : {}),
    body: new Uint8Array((xhr.response as ArrayBuffer | null) ?? new ArrayBuffer(0)),
  };
};

worker.skriuwSyncEvent = (eventJson) => {
  let value: unknown;
  try {
    value = JSON.parse(eventJson);
  } catch {
    return;
  }
  worker.postMessage({
    protocolVersion: 1,
    requestId: 0,
    status: "event",
    value,
  });
};

let initialized = false;
let terminal = false;
let initializationFailure: string | null = null;
let queue = initWasm()
  .then(() => undefined)
  .catch((error: unknown) => {
    terminal = true;
    initializationFailure = describeInitializationFailure(error);
  });

worker.onmessage = (event) => {
  const request = event.data;
  queue = queue.then(async () => {
    if (terminal) {
      postTerminal(request?.requestId ?? 0, initializationFailure);
      return;
    }
    try {
      postStarted(request.requestId);
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

// The client starts a request's deadline only once the worker reports it
// began, so a request queued behind a long sync cycle never times out the
// worker while the cycle is still healthy.
function postStarted(requestId: number): void {
  worker.postMessage({
    protocolVersion: 1,
    requestId,
    status: "event",
    value: { kind: "started" },
  });
}

function postTerminal(requestId: number, initializationDetail: string | null = null): void {
  worker.postMessage({
    protocolVersion: 1,
    requestId,
    status: "error",
    value: {
      code: "worker_crashed",
      message: initializationDetail
        ? `The browser storage worker could not start: ${initializationDetail}`
        : "The browser storage worker failed.",
      recovery: "Reload Skriuw; accepted writes may already be durable.",
      terminal: true,
    },
  });
}

function describeInitializationFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.replaceAll(/[\r\n\t]+/g, " ").slice(0, 240);
}
