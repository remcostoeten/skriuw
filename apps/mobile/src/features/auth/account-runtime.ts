import type { BridgePort, WorkspaceSyncStatus } from "@skriuw/renderer-core/bridge/port";
import type { NativeBridge, RemoteWorkspaceChange } from "../../bridge/native-adapter";
import { createSyncLifecycle, type LifecyclePort } from "../sync/lifecycle";
import type { MobileSyncPort } from "../sync/port";
import {
  createWakeChannel,
  type WakeChannel,
  type WakeSocketFactory,
  type WakeTimer,
} from "../sync/wake-channel";
import { createAccountController, type AccountController, type AccountView } from "./account";
import { createAuthClient } from "./client";
import { connectSyncForCurrentSession } from "./connect";
import type { Keystore } from "./keystore";
import { createSessionStore } from "./session";

export type AccountBridge = MobileSyncPort &
  Pick<BridgePort, "adoptWorkspaceSlot"> &
  Pick<NativeBridge, "subscribeSyncEvents">;

export type AccountState = {
  account: AccountView;
  /** The coordinator's latest report; `localOnly` until something connects. */
  sync: WorkspaceSyncStatus;
};

export type AccountRuntimeOptions = {
  bridge: AccountBridge;
  baseUrl: string;
  keystore: Keystore;
  fetch: typeof globalThis.fetch;
  foreground: LifecyclePort<boolean>;
  online: LifecyclePort<boolean>;
  socket: WakeSocketFactory;
  timer: WakeTimer;
  /**
   * Closes every handle on the previous account's storage and reopens the
   * workspace on the directory the core routed to (ADR-0046).
   */
  reopenWorkspace: () => Promise<void>;
  reportError: (error: unknown) => void;
};

export type AccountRuntime = Pick<
  AccountController,
  "signIn" | "signUp" | "signOut" | "retryConnection"
> & {
  state: () => AccountState;
  /** Returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** Remote changes the coordinator applied, for the store reconciler. */
  onWorkspaceChange: (listener: (change: RemoteWorkspaceChange) => void) => () => void;
  /** Restores a stored session and starts the sync lifecycle. Returns the teardown. */
  start: () => () => void;
};

/**
 * @name createAccountRuntime
 * @description Assembles the account surface for this installation: the
 * credential in the platform keystore, sign-in against the cloud Worker,
 * routing to the account's own workspace, replication through the native
 * core, and the resume lifecycle with its foreground wake channel. A routed
 * account reopens the workspace once and then connects in place.
 *
 * @example
 * const runtime = createAccountRuntime({ bridge, baseUrl, keystore, fetch, ...ports });
 * const stop = runtime.start();
 * await runtime.signIn({ email, password });
 */
export function createAccountRuntime(options: AccountRuntimeOptions): AccountRuntime {
  const { bridge, baseUrl, reportError } = options;
  const listeners = new Set<() => void>();
  const changeListeners = new Set<(change: RemoteWorkspaceChange) => void>();
  let state: AccountState = {
    account: { kind: "signed-out", failure: null, busy: false },
    sync: { state: "localOnly" },
  };
  let reopening = false;

  const session = createSessionStore(options.keystore, { reportError });
  const client = createAuthClient({ baseUrl, session, fetch: options.fetch });

  function publish(next: Partial<AccountState>): void {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  const wakeChannel: WakeChannel = createWakeChannel({
    async target() {
      const url = await bridge.workspaceWakeChannelUrl();
      const bearer = await session.current();
      if (url === null || bearer === null) return null;
      return { url: url.replace(/^http/, "ws"), bearer };
    },
    socket: options.socket,
    timer: options.timer,
    onConnected: (connected) => {
      bridge.setWakeChannelConnected(connected).catch(reportError);
    },
    onRemoteChange: () => {
      bridge.notifyRemoteChange().catch(reportError);
    },
    reportError,
  });

  const lifecycle = createSyncLifecycle({
    port: bridge,
    foreground: options.foreground,
    online: options.online,
    wakeChannel,
    onStatus: (sync) => publish({ sync }),
    reportError,
  });

  async function reopenAndConnect(): Promise<void> {
    reopening = true;
    try {
      await options.reopenWorkspace();
    } catch (error) {
      reportError(error);
    }
    await controller.retryConnection();
  }

  function viewChanged(account: AccountView): void {
    if (account.kind === "signed-out") {
      reopening = false;
      wakeChannel.close();
      publish({ account, sync: { state: "localOnly" } });
      return;
    }
    const { connection } = account;
    if (connection.kind === "connected") {
      reopening = false;
      publish({ account, sync: connection.status });
      if (options.foreground.current()) {
        wakeChannel.close();
        wakeChannel.open();
      }
      return;
    }
    if (connection.kind === "reopen-required") {
      if (reopening) {
        reopening = false;
        publish({
          account: {
            ...account,
            connection: {
              kind: "failed",
              message: "Sync could not start: this account's workspace did not open.",
            },
          },
        });
        return;
      }
      publish({ account });
      void reopenAndConnect();
      return;
    }
    publish({ account });
  }

  const controller = createAccountController({
    client,
    connect: () => connectSyncForCurrentSession({ baseUrl, session, bridge, fetch: options.fetch }),
    pause: async () => {
      await bridge.pauseWorkspaceSync();
    },
    onChange: viewChanged,
    reportError,
  });

  return {
    state: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    onWorkspaceChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },

    signIn: (credentials) => controller.signIn(credentials),
    signUp: (registration) => controller.signUp(registration),
    signOut: () => controller.signOut(),
    retryConnection: () => controller.retryConnection(),

    start() {
      const unsubscribe = bridge.subscribeSyncEvents((event) => {
        if (event.kind === "status") {
          publish({ sync: event.status });
          return;
        }
        if (event.kind === "workspaceChanged") {
          for (const listener of changeListeners) listener(event.change);
          return;
        }
        wakeChannel.close();
        controller.signOut().catch(reportError);
      });
      const stopLifecycle = lifecycle.start();
      controller.restore().catch(reportError);
      return () => {
        unsubscribe();
        stopLifecycle();
      };
    },
  };
}
