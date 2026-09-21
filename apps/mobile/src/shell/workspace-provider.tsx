import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import type { Equality, Selector } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import {
  createStartupFailureFlow,
  describeStartupFailure,
  type StartupFailureView,
} from "../bridge/startup-failure";
import { loadWorkspaceBridge } from "../bridge/workspace-bridge";
import { StartupScreen } from "./startup-screen";
import { openWorkspaceSession, type ShellSession } from "./workspace-session";

const WorkspaceContext = createContext<ShellSession | null>(null);

type Props = {
  children: ReactNode;
  /**
   * The command surface the shell runs against. Defaults to the platform's own
   * bridge — the native core on a device, the in-memory preview on web. Tests
   * and the search probe route hand in their own.
   */
  bridge?: BridgePort;
};

export function WorkspaceProvider({ bridge, children }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<ShellSession | null>(null);
  const [failure, setFailure] = useState<StartupFailureView | null>(null);
  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: ShellSession | null = null;

    async function open(): Promise<ShellSession> {
      const port = bridge ?? (await loadWorkspaceBridge());
      return openWorkspaceSession(port, reportWorkspaceFailure);
    }

    open()
      .then((nextSession) => {
        opened = nextSession;
        if (cancelled) {
          void nextSession.close();
          return;
        }
        setSession(nextSession);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        createStartupFailureFlow({
          resetWorkspace: null,
          retry,
          render: setFailure,
          reportError: reportWorkspaceFailure,
        }).show(describeStartupFailure(error));
      });
    return () => {
      cancelled = true;
      void opened?.close();
    };
  }, [attempt, bridge, retry]);

  if (failure !== null) {
    return <StartupScreen view={failure} />;
  }
  if (session === null) {
    return <StartupScreen view={null} />;
  }
  return <WorkspaceContext.Provider value={session}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): ShellSession {
  const session = useContext(WorkspaceContext);
  if (!session) {
    throw new Error("useWorkspace was called outside WorkspaceProvider");
  }
  return session;
}

/** Subscribes to exactly the slice a view renders (`docs/performance-contract.md`). */
export function useWorkspaceSelector<T>(selector: Selector<T>, equality?: Equality<T>): T {
  return useRendererSelector(useWorkspace().store, selector, equality);
}

function reportWorkspaceFailure(error: unknown): void {
  console.error("workspace command rejected", error);
}
