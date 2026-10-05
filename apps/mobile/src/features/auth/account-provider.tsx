import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { commitGate } from "@skriuw/renderer-core/store/commit-gate";
import { describeCoreLoadFailure } from "../../bridge/workspace-bridge";
import { useWorkspace } from "../../shell/workspace-provider";
import {
  createForegroundPort,
  createOnlinePort,
  platformWakeSocket,
  platformWakeTimer,
} from "../sync/platform-ports";
import { createRemoteChangeReconciler } from "../sync/remote-changes";
import { ACCOUNT_UNAVAILABLE_ON_WEB, loadAccountBridge } from "./account-bridge";
import { createAccountRuntime, type AccountRuntime, type AccountState } from "./account-runtime";
import { resolveCloudConfiguration } from "./cloud-configuration";
import { platformSecureStore, createPlatformKeystore } from "./platform-keystore";

export type AccountAvailability =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "available"; runtime: AccountRuntime };

const LOADING: AccountAvailability = { kind: "loading" };

const AccountContext = createContext<AccountAvailability>(LOADING);

type Props = {
  children: ReactNode;
};

/**
 * Holds the account for the life of the process, above the workspace. When
 * the core routes a sign-in to another account's storage, the native handle is
 * closed and everything below is remounted, so the workspace opens on the
 * routed directory the way the desktop shell restarts into it (ADR-0046).
 */
export function AccountProvider({ children }: Props) {
  const [availability, setAvailability] = useState<AccountAvailability>(LOADING);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;

    async function open(): Promise<AccountAvailability> {
      const bridge = await loadAccountBridge().catch((error: unknown) => {
        throw describeCoreLoadFailure(error);
      });
      if (bridge === null) {
        return { kind: "unavailable", reason: ACCOUNT_UNAVAILABLE_ON_WEB };
      }
      const cloud = resolveCloudConfiguration({
        cloudUrl: process.env.EXPO_PUBLIC_SKRIUW_CLOUD_URL,
        development: __DEV__,
      });
      if (!cloud.available) {
        return { kind: "unavailable", reason: cloud.reason };
      }
      const runtime = createAccountRuntime({
        bridge,
        baseUrl: cloud.baseUrl,
        keystore: createPlatformKeystore(platformSecureStore()),
        fetch: globalThis.fetch.bind(globalThis),
        foreground: createForegroundPort(),
        online: createOnlinePort(),
        socket: platformWakeSocket,
        timer: platformWakeTimer,
        reopenWorkspace: async () => {
          await bridge.close();
          setGeneration((current) => current + 1);
        },
        reportError: reportAccountFailure,
      });
      return { kind: "available", runtime };
    }

    async function load(): Promise<void> {
      let next: AccountAvailability;
      try {
        next = await open();
      } catch (error) {
        reportAccountFailure(error);
        next = {
          kind: "unavailable",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      if (cancelled) return;
      if (next.kind === "available") {
        stop = next.runtime.start();
      }
      setAvailability(next);
    }

    void load();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <AccountContext.Provider value={availability}>
      <Fragment key={generation}>{children}</Fragment>
    </AccountContext.Provider>
  );
}

export function useAccountAvailability(): AccountAvailability {
  return useContext(AccountContext);
}

const SIGNED_OUT: AccountState = {
  account: { kind: "signed-out", failure: null, busy: false },
  sync: { state: "localOnly" },
};

function noSubscription(): () => void {
  return () => undefined;
}

/** The account and sync state, or signed out while there is no runtime. */
export function useAccountState(): AccountState {
  const availability = useAccountAvailability();
  const runtime = availability.kind === "available" ? availability.runtime : null;
  return useSyncExternalStore(
    runtime?.subscribe ?? noSubscription,
    () => runtime?.state() ?? SIGNED_OUT,
  );
}

/**
 * Applies what the sync coordinator changed in canonical storage to the open
 * store. Mounted inside the workspace, since it reconciles that session.
 */
export function RemoteChangeSync() {
  const availability = useAccountAvailability();
  const session = useWorkspace();
  const runtime = availability.kind === "available" ? availability.runtime : null;

  useEffect(() => {
    if (runtime === null) return;
    const reconciler = createRemoteChangeReconciler({
      store: session.store,
      gate: commitGate,
      bootstrap: () => session.bridge.bootstrapWorkspace(),
      readDelta: (noteIds) => session.bridge.readWorkspaceDelta(noteIds),
      onError: session.reportFailure,
    });
    const unsubscribe = runtime.onWorkspaceChange((change) => reconciler.report(change));
    return () => {
      unsubscribe();
      reconciler.dispose();
    };
  }, [runtime, session]);

  return null;
}

function reportAccountFailure(error: unknown): void {
  console.error("account failure", error);
}
