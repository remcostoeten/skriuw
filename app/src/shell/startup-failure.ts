import type { BrowserStorageErrorCode } from "../../../crates/skriuw-sqlite-wasm/web/worker-client.ts";
import type { StartupScreenAction } from "@/shell/startup-screen";

export type StartupFailure = {
  code: string | null;
  message: string;
  recovery: string | null;
};

export type StartupFailureView = {
  title: string;
  detail: string;
  hint: string | null;
  actions: readonly StartupScreenAction[];
};

export type StartupFailureFlowPort = {
  browserRuntime: boolean;
  resetWorkspace: () => Promise<void>;
  retry: () => void;
  render: (view: StartupFailureView) => void;
  reportError?: (error: unknown) => void;
};

export type StartupFailureFlow = {
  show: (failure: StartupFailure) => void;
};

const MAX_CAUSE_DEPTH = 4;

/**
 * Terminal open-path codes that no amount of retrying clears. The settings
 * surface that owns "clear all data" never mounts for these, so the startup
 * screen has to offer the reset itself or the tab has no way forward.
 *
 * `database_too_new` is deliberately absent: a downgraded tab can still be
 * fixed by upgrading, and resetting would destroy writes this build cannot
 * read. `quota_exceeded` is absent because freeing browser storage recovers
 * the same workspace without erasing it.
 */
const RESETTABLE_STARTUP_CODES: ReadonlySet<BrowserStorageErrorCode> = new Set([
  "corrupt_database",
  "migration_failed",
  "open_failed",
  "worker_crashed",
]);

const RESET_DETAIL =
  "Every note stored in this browser is erased and Skriuw starts empty. Notes already synced to your account are downloaded again after you sign in.";
const RESET_HINT = "This cannot be undone, and the unopenable database cannot be exported first.";

/**
 * Reads the storage failure record out of a rejection. Codes survive being
 * wrapped in an `Error`, so the escape hatch below stays reachable even when a
 * layer between the worker and startup re-throws with a `cause`.
 */
function readCodedFailure(value: unknown, depth: number): StartupFailure | null {
  if (depth > MAX_CAUSE_DEPTH || typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as {
    code?: unknown;
    message?: unknown;
    recovery?: unknown;
    cause?: unknown;
  };
  if (typeof candidate.code === "string") {
    return {
      code: candidate.code,
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : `Browser storage failed (${candidate.code}).`,
      recovery: typeof candidate.recovery === "string" ? candidate.recovery : null,
    };
  }
  return readCodedFailure(candidate.cause, depth + 1);
}

/**
 * Startup rejections arrive either as `Error`s or as the plain
 * `BrowserStorageFailure` records the storage worker rejects with, so the
 * fallback screen has to read both instead of stringifying an object.
 */
export function describeStartupFailure(error: unknown): StartupFailure {
  const coded = readCodedFailure(error, 0);
  if (coded !== null) {
    return coded;
  }
  if (error instanceof Error) {
    return { code: null, message: error.message, recovery: null };
  }
  if (typeof error === "object" && error !== null) {
    const failure = error as { message?: unknown; recovery?: unknown };
    if (typeof failure.message === "string") {
      return {
        code: null,
        message: failure.message,
        recovery: typeof failure.recovery === "string" ? failure.recovery : null,
      };
    }
  }
  return { code: null, message: String(error), recovery: null };
}

export function isResettableFailure(failure: StartupFailure, browserRuntime: boolean): boolean {
  return (
    browserRuntime &&
    failure.code !== null &&
    RESETTABLE_STARTUP_CODES.has(failure.code as BrowserStorageErrorCode)
  );
}

/**
 * Drives the workspace-failure screen: the failure itself, the destructive
 * confirmation behind it, and the in-flight and rejected states of the reset.
 * A successful reset never renders again because the bridge reloads the tab.
 */
export function createStartupFailureFlow(port: StartupFailureFlowPort): StartupFailureFlow {
  let resetting = false;

  function renderFailure(failure: StartupFailure): void {
    const actions: StartupScreenAction[] = [
      { label: "Retry", variant: "primary", onSelect: port.retry },
    ];
    if (isResettableFailure(failure, port.browserRuntime)) {
      actions.push({
        label: "Reset workspace…",
        variant: "danger",
        onSelect: () => renderConfirmation(failure),
      });
    }
    port.render({
      title: "Skriuw could not open your workspace",
      detail: failure.message,
      hint: failure.recovery,
      actions,
    });
  }

  function renderConfirmation(failure: StartupFailure): void {
    port.render({
      title: "Delete this browser workspace?",
      detail: RESET_DETAIL,
      hint: resetting ? "Deleting this browser workspace…" : RESET_HINT,
      actions: [
        { label: "Cancel", disabled: resetting, onSelect: () => renderFailure(failure) },
        {
          label: "Delete and reload",
          variant: "dangerFilled",
          disabled: resetting,
          onSelect: () => void runReset(failure),
        },
      ],
    });
  }

  async function runReset(failure: StartupFailure): Promise<void> {
    if (resetting) {
      return;
    }
    resetting = true;
    renderConfirmation(failure);
    try {
      await port.resetWorkspace();
    } catch (error) {
      resetting = false;
      port.reportError?.(error);
      renderFailure({
        code: failure.code,
        message: "Skriuw could not delete the browser workspace.",
        recovery: "Clear this site's data from your browser settings, then reload Skriuw.",
      });
    }
  }

  return {
    show(failure: StartupFailure): void {
      resetting = false;
      renderFailure(failure);
    },
  };
}
