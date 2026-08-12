export const WORKER_PROTOCOL_VERSION = 1;
export const INITIALIZATION_TIMEOUT_MS = 15_000;
export const REQUEST_TIMEOUT_MS = 30_000;

export type BrowserStorageErrorCode =
  | "unsupported_browser"
  | "opfs_denied"
  | "cross_origin_isolation_unavailable"
  | "quota_exceeded"
  | "migration_failed"
  | "database_too_new"
  | "corrupt_database"
  | "open_failed"
  | "worker_crashed"
  | "invalid_request"
  | "unsupported_protocol"
  | "conflict"
  | "not_found"
  | "already_exists"
  | "backend"
  | "not_ready"
  | "already_initialized"
  | "shutting_down"
  | "shutdown"
  | "timed_out";

export type BrowserStorageFailure = {
  code: BrowserStorageErrorCode;
  message: string;
  recovery: string;
  terminal: boolean;
};

type WorkerResponse = {
  protocolVersion: number;
  requestId: number;
  status: "ok" | "error" | "event";
  value: unknown;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(reason: BrowserStorageFailure): void;
  timeout: ReturnType<typeof setTimeout>;
};

type Lifecycle = "initializing" | "ready" | "closing" | "closed" | "terminal";

export class BrowserStorageWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  #lifecycle: Lifecycle = "initializing";
  #nextRequestId = 1;
  #eventListener: ((value: unknown) => void) | null = null;

  constructor(worker: Worker) {
    this.#worker = worker;
    this.#worker.addEventListener("message", this.#handleMessage);
    this.#worker.addEventListener("error", this.#handleCrash);
    this.#worker.addEventListener("messageerror", this.#handleMessageError);
  }

  async initialize(databaseName = "workspace.sqlite3"): Promise<void> {
    if (this.#lifecycle !== "initializing") {
      throw failure(
        "already_initialized",
        "Browser storage initialization has already completed.",
        "Reuse this worker or terminate it before opening another workspace.",
      );
    }
    await this.#send("initialize", { databaseName }, INITIALIZATION_TIMEOUT_MS);
    this.#lifecycle = "ready";
  }

  request<T>(kind: string, payload?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.#lifecycle !== "ready") {
      return Promise.reject(
        failure(
          this.#lifecycle === "closed" ? "shutdown" : "not_ready",
          "Browser storage is not ready.",
          "Wait for initialization or create a new worker after shutdown.",
          this.#lifecycle === "closed" || this.#lifecycle === "terminal",
        ),
      );
    }
    return this.#send(kind, payload, timeoutMs) as Promise<T>;
  }

  /** Receives out-of-band worker notifications (requestId 0), such as sync
   * transfer progress posted while a long request is still in flight. */
  setEventListener(listener: ((value: unknown) => void) | null): void {
    this.#eventListener = listener;
  }

  async close(): Promise<void> {
    if (this.#lifecycle === "closed") return;
    if (this.#lifecycle === "terminal") {
      this.#worker.terminate();
      this.#lifecycle = "closed";
      return;
    }
    this.#lifecycle = "closing";
    try {
      await this.#send("close", undefined, REQUEST_TIMEOUT_MS);
    } finally {
      this.#worker.terminate();
      this.#rejectAll(
        failure("shutdown", "Browser storage has closed.", "Create a new worker to reopen it.", true),
      );
      this.#lifecycle = "closed";
    }
  }

  terminate(): void {
    this.#worker.terminate();
    this.#rejectAll(
      failure(
        "worker_crashed",
        "The browser storage worker was terminated.",
        "Reload Skriuw to reopen the durable workspace.",
        true,
      ),
    );
    this.#lifecycle = "terminal";
  }

  #send(kind: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    const requestId = this.#nextRequestId++;
    if (!Number.isSafeInteger(requestId)) {
      this.terminate();
      return Promise.reject(
        failure("worker_crashed", "Worker request IDs were exhausted.", "Reload Skriuw.", true),
      );
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = failure(
          "timed_out",
          "The browser storage worker did not respond in time.",
          "Reload Skriuw; accepted writes may already be durable.",
          true,
        );
        this.#worker.terminate();
        this.#lifecycle = "terminal";
        this.#rejectAll(error);
      }, timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timeout });
      try {
        this.#worker.postMessage({
          protocolVersion: WORKER_PROTOCOL_VERSION,
          requestId,
          kind,
          ...(payload === undefined ? {} : { payload }),
        });
      } catch {
        clearTimeout(timeout);
        this.#pending.delete(requestId);
        reject(
          failure(
            "worker_crashed",
            "The browser storage request could not be sent.",
            "Reload Skriuw to reopen the workspace.",
            true,
          ),
        );
      }
    });
  }

  readonly #handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    if (
      !response ||
      response.protocolVersion !== WORKER_PROTOCOL_VERSION ||
      !Number.isSafeInteger(response.requestId)
    ) {
      this.terminate();
      return;
    }
    if (response.requestId === 0 && response.status === "event") {
      this.#eventListener?.(response.value);
      return;
    }
    const pending = this.#pending.get(response.requestId);
    if (!pending) return;
    this.#pending.delete(response.requestId);
    clearTimeout(pending.timeout);
    if (response.status === "ok") pending.resolve(response.value);
    else pending.reject(response.value as BrowserStorageFailure);
  };

  readonly #handleCrash = (): void => {
    this.#rejectAll(
      failure(
        "worker_crashed",
        "The browser storage worker crashed.",
        "Reload Skriuw; accepted writes may already be durable.",
        true,
      ),
    );
    this.#lifecycle = "terminal";
  };

  readonly #handleMessageError = (): void => {
    this.terminate();
  };

  #rejectAll(error: BrowserStorageFailure): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

function failure(
  code: BrowserStorageErrorCode,
  message: string,
  recovery: string,
  terminal = false,
): BrowserStorageFailure {
  return { code, message, recovery, terminal };
}
