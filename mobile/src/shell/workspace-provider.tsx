import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BridgePort } from "../../../shared/renderer-core/src/bridge/port";
import { createMemoryBridge } from "../../../shared/renderer-core/src/bridge/memory-adapter";
import type { Equality, Selector } from "../../../shared/renderer-core/src/store/types";
import { useRendererSelector } from "../../../shared/renderer-core/src/store/use-renderer-selector";
import {
  createStartupFailureFlow,
  describeStartupFailure,
  type StartupFailureView,
} from "../bridge/startup-failure";
import { demoSnapshot } from "./demo-workspace";
import { StartupScreen } from "./startup-screen";
import { openWorkspaceSession, type ShellSession } from "./workspace-session";

const WorkspaceContext = createContext<ShellSession | null>(null);

type Props = {
  children: ReactNode;
  /**
   * The command surface the shell runs against. Defaults to the in-memory
   * adapter; the native bridge is handed in once the module ships a binary
   * (`docs/specs/mobile-app.md`, work breakdown).
   */
  bridge?: BridgePort;
};

export function WorkspaceProvider({ bridge, children }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<ShellSession | null>(null);
  const [failure, setFailure] = useState<StartupFailureView | null>(null);
  const port = useMemo(() => bridge ?? createMemoryBridge({ snapshot: demoSnapshot() }), [bridge]);
  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: ShellSession | null = null;
    openWorkspaceSession(port, reportWorkspaceFailure)
      .then((next) => {
        opened = next;
        if (cancelled) {
          void next.close();
          return;
        }
        setSession(next);
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
  }, [attempt, port, retry]);

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
