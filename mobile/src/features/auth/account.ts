import type { WorkspaceSyncStatus } from "../../../../shared/renderer-core/src/bridge/port";
import type {
  Account,
  AuthClient,
  AuthFailure,
  Credentials,
  Registration,
} from "./client";
import type { ConnectOutcome } from "./connect";

/**
 * The account surface as a state machine, with no React in it.
 *
 * Sign-in is the moment the user asks for sync, so a successful credential is
 * followed straight by routing and connecting. That second half can fail on
 * its own — a reachable auth service and an unreachable sync service are
 * different outcomes — so it has its own state rather than being folded into
 * the sign-in result, and it offers a retry that does not ask for the password
 * again.
 */

export const KEYSTORE_NOT_PERSISTED_MESSAGE =
  "Signed in, but this device could not store your credential: you will sign in again after restarting.";

export type AccountView =
  | { kind: "signed-out"; failure: AuthFailure | null; busy: boolean }
  /** Credential accepted, replication not started yet or failed. */
  | {
      kind: "signed-in";
      account: Account;
      warning: string | null;
      connection:
        | { kind: "connecting" }
        | { kind: "connected"; status: WorkspaceSyncStatus }
        | { kind: "reopen-required"; workspaceId: string }
        | { kind: "failed"; message: string };
    };

export type AccountController = {
  /** Current view. Always safe to read; never throws. */
  view: () => AccountView;
  /** Reads the stored credential at startup and connects if there is one. */
  restore: () => Promise<void>;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (registration: Registration) => Promise<void>;
  /** Retries routing and connecting without asking for the password again. */
  retryConnection: () => Promise<void>;
  signOut: () => Promise<void>;
};

export type AccountControllerOptions = {
  client: AuthClient;
  /** `connectSyncForCurrentSession`, bound to this installation. */
  connect: () => Promise<ConnectOutcome>;
  /** Stops replication without discarding anything local. */
  pause: () => Promise<void>;
  onChange: (view: AccountView) => void;
  reportError?: (error: unknown) => void;
};

export function createAccountController(options: AccountControllerOptions): AccountController {
  let view: AccountView = { kind: "signed-out", failure: null, busy: false };
  /** Rising counter so a slow flow cannot overwrite a newer one's view. */
  let generation = 0;

  function publish(next: AccountView, forGeneration: number): void {
    if (forGeneration !== generation) return;
    view = next;
    options.onChange(view);
  }

  function connectionMessage(error: unknown): string {
    options.reportError?.(error);
    const detail = error instanceof Error ? error.message : String(error);
    return `Sync could not start: ${detail}`;
  }

  async function connect(account: Account, warning: string | null): Promise<void> {
    const forGeneration = generation;
    publish({ kind: "signed-in", account, warning, connection: { kind: "connecting" } }, forGeneration);
    let outcome: ConnectOutcome;
    try {
      outcome = await options.connect();
    } catch (error) {
      publish(
        {
          kind: "signed-in",
          account,
          warning,
          connection: { kind: "failed", message: connectionMessage(error) },
        },
        forGeneration,
      );
      return;
    }
    if (outcome.kind === "signed-out") {
      publish({ kind: "signed-out", failure: null, busy: false }, forGeneration);
      return;
    }
    const connection =
      outcome.kind === "reopen-required"
        ? ({ kind: "reopen-required", workspaceId: outcome.workspaceId } as const)
        : ({ kind: "connected", status: outcome.status } as const);
    publish({ kind: "signed-in", account, warning, connection }, forGeneration);
  }

  async function authenticate(
    run: () => Promise<Awaited<ReturnType<AuthClient["signIn"]>>>,
  ): Promise<void> {
    generation += 1;
    const forGeneration = generation;
    publish({ kind: "signed-out", failure: null, busy: true }, forGeneration);
    const result = await run();
    if (!result.ok) {
      publish({ kind: "signed-out", failure: result.error, busy: false }, forGeneration);
      return;
    }
    await connect(
      result.value.account,
      result.value.persisted ? null : KEYSTORE_NOT_PERSISTED_MESSAGE,
    );
  }

  return {
    view: () => view,

    async restore() {
      generation += 1;
      const forGeneration = generation;
      const result = await options.client.currentAccount();
      if (!result.ok || result.value === null) {
        publish({ kind: "signed-out", failure: null, busy: false }, forGeneration);
        return;
      }
      await connect(result.value, null);
    },

    signIn: (credentials) => authenticate(() => options.client.signIn(credentials)),

    signUp: (registration) => authenticate(() => options.client.signUp(registration)),

    async retryConnection() {
      if (view.kind !== "signed-in") return;
      await connect(view.account, view.warning);
    },

    async signOut() {
      generation += 1;
      const forGeneration = generation;
      try {
        await options.pause();
      } catch (error) {
        // Pausing is best-effort: the credential still has to go, or the
        // device stays signed in to an account the user left.
        options.reportError?.(error);
      }
      await options.client.signOut();
      publish({ kind: "signed-out", failure: null, busy: false }, forGeneration);
    },
  };
}
