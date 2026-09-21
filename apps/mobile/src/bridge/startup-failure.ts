import { SkriuwCoreError, type SkriuwCoreErrorKind } from "../../modules/skriuw-core/src/errors";

export type StartupFailure = {
  code: SkriuwCoreErrorKind | null;
  message: string;
  recovery: string | null;
};

export type StartupScreenAction = {
  label: string;
  variant?: "primary" | "danger" | "dangerFilled";
  disabled?: boolean;
  onSelect: () => void;
};

export type StartupFailureView = {
  title: string;
  detail: string;
  hint: string | null;
  actions: readonly StartupScreenAction[];
};

export type StartupFailureFlowPort = {
  /**
   * Erases the workspace slot and restarts startup. `null` while the native
   * core cannot erase a slot it failed to open; the action is then withheld
   * instead of offered and failing.
   */
  resetWorkspace: (() => Promise<void>) | null;
  retry: () => void;
  render: (view: StartupFailureView) => void;
  reportError?: (error: unknown) => void;
};

export type StartupFailureFlow = {
  show: (failure: StartupFailure) => void;
};

const MAX_CAUSE_DEPTH = 4;

/**
 * Open-path kinds no amount of retrying clears, mirroring
 * `RESETTABLE_STARTUP_CODES` in `apps/workspace/src/shell/startup-failure.ts`.
 *
 * `unsupported-protocol` is deliberately absent: updating the app fixes it and
 * a reset would destroy writes this build cannot read. `busy` and
 * `slot-in-use` clear on their own.
 */
const RESETTABLE_STARTUP_KINDS: ReadonlySet<SkriuwCoreErrorKind> = new Set(["recovery", "workspace"]);

const RECOVERY_BY_KIND: Partial<Record<SkriuwCoreErrorKind, string>> = {
  "unsupported-protocol": "Update Skriuw to open this workspace.",
  busy: "The workspace is still starting. Try again in a moment.",
  "slot-in-use": "Close other Skriuw windows using this workspace, then try again.",
};

const RESET_DETAIL =
  "Every note stored on this device is erased and Skriuw starts empty. Notes already synced to your account are downloaded again after you sign in.";
const RESET_HINT = "This cannot be undone, and the unopenable database cannot be exported first.";

function findCoreError(value: unknown, depth: number): SkriuwCoreError | null {
  if (depth > MAX_CAUSE_DEPTH || typeof value !== "object" || value === null) {
    return null;
  }
  if (value instanceof SkriuwCoreError) {
    return value;
  }
  return findCoreError((value as { cause?: unknown }).cause, depth + 1);
}

/**
 * Kinds survive being wrapped in an `Error`, so the reset stays reachable even
 * when a layer between the native module and startup re-throws with a `cause`.
 */
export function describeStartupFailure(error: unknown): StartupFailure {
  const coreError = findCoreError(error, 0);
  if (coreError !== null) {
    return {
      code: coreError.kind,
      message: coreError.message,
      recovery: RECOVERY_BY_KIND[coreError.kind] ?? null,
    };
  }
  if (error instanceof Error) {
    return { code: null, message: error.message, recovery: null };
  }
  return { code: null, message: String(error), recovery: null };
}

export function isResettableFailure(failure: StartupFailure): boolean {
  return failure.code !== null && RESETTABLE_STARTUP_KINDS.has(failure.code);
}

/**
 * Drives the workspace-failure screen: the failure itself, the destructive
 * confirmation behind it, and the in-flight and rejected states of the reset.
 * A successful reset never renders again because `resetWorkspace` restarts
 * startup.
 */
export function createStartupFailureFlow(port: StartupFailureFlowPort): StartupFailureFlow {
  let resetting = false;
  let shown = 0;

  function renderFailure(failure: StartupFailure): void {
    const actions: StartupScreenAction[] = [
      { label: "Retry", variant: "primary", onSelect: port.retry },
    ];
    const reset = port.resetWorkspace;
    if (reset !== null && isResettableFailure(failure)) {
      actions.push({
        label: "Reset workspace…",
        variant: "danger",
        onSelect: () => renderConfirmation(failure, reset),
      });
    }
    port.render({
      title: "Skriuw could not open your workspace",
      detail: failure.message,
      hint: failure.recovery,
      actions,
    });
  }

  function renderConfirmation(failure: StartupFailure, reset: () => Promise<void>): void {
    port.render({
      title: "Delete this device's workspace?",
      detail: RESET_DETAIL,
      hint: resetting ? "Deleting this device's workspace…" : RESET_HINT,
      actions: [
        { label: "Cancel", disabled: resetting, onSelect: () => renderFailure(failure) },
        {
          label: "Delete and restart",
          variant: "dangerFilled",
          disabled: resetting,
          onSelect: () => void runReset(failure, reset),
        },
      ],
    });
  }

  async function runReset(failure: StartupFailure, reset: () => Promise<void>): Promise<void> {
    if (resetting) {
      return;
    }
    resetting = true;
    const startedFor = shown;
    renderConfirmation(failure, reset);
    try {
      await reset();
    } catch (error) {
      port.reportError?.(error);
      if (startedFor !== shown) {
        return;
      }
      resetting = false;
      renderFailure({
        code: failure.code,
        message: "Skriuw could not delete the workspace on this device.",
        recovery: "Clear Skriuw's storage from the system settings, then open Skriuw again.",
      });
    }
  }

  return {
    show(failure: StartupFailure): void {
      shown += 1;
      resetting = false;
      renderFailure(failure);
    },
  };
}
