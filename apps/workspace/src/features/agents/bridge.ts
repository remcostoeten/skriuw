import { getVersion } from "@tauri-apps/api/app";
import { listen, type Event } from "@tauri-apps/api/event";
import { commitOperations, commitReferenceOperations } from "@/store/commit";
import { flushPendingWork } from "@/store/pending-work";
import { searchWorkspace } from "@/platform/runtime/commands";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { noop } from "@skriuw/shared/helpers/noop";
import {
  AGENT_REQUEST_EVENT,
  answerAgentRequest,
  attachAgentBridge,
  detachAgentBridge,
} from "./commands";
import type { ToolContext } from "./context";
import { createAgentServer, type AgentServer } from "./protocol/server";
import { AGENT_INSTRUCTIONS, AGENT_TOOLS } from "./tools";

type RequestPayload = { requestId: number; message: string };

/**
 * @name createAgentWorkspaceServer
 * @description The MCP server over this window's store, writing through the
 * same commit path as the interface so agent changes show up live.
 *
 * @example
 * const server = createAgentWorkspaceServer(store, "0.56.0");
 */
export function createAgentWorkspaceServer(store: RendererStore, version: string): AgentServer {
  const context: ToolContext = {
    store,
    commit: (operations) => commitOperations(store, operations),
    commitReferences: (operations) => commitReferenceOperations(store, operations),
    flush: flushPendingWork,
    search: (query, limit) => searchWorkspace(query, limit),
    now: () => Date.now(),
    createId: () => crypto.randomUUID(),
  };
  return createAgentServer(AGENT_TOOLS, () => context, {
    version,
    instructions: AGENT_INSTRUCTIONS,
  });
}

/**
 * @name bindAgentBridge
 * @description Answers requests from the local agent endpoint once the
 * workspace is open. The backend refuses agent requests until this window
 * attaches, and again after it detaches.
 *
 * @example
 * const unbind = await bindAgentBridge(store);
 */
export async function bindAgentBridge(store: RendererStore): Promise<() => void> {
  if (isBrowserRuntime()) return noop;
  const version = await getVersion().catch(() => "dev");
  const server = createAgentWorkspaceServer(store, version);
  const unlisten = await listen(AGENT_REQUEST_EVENT, (event: Event<RequestPayload>) => {
    const payload = readPayload(event.payload);
    if (payload === null) return;
    void server
      .handle(payload.message)
      .then((answer) =>
        answerAgentRequest(
          payload.requestId,
          answer ?? JSON.stringify({ jsonrpc: "2.0", id: null, result: {} }),
        ),
      )
      .catch((error: unknown) => console.error("agent request could not be answered", error));
  });
  await attachAgentBridge().catch((error: unknown) => {
    unlisten();
    throw error;
  });
  return () => {
    unlisten();
    detachAgentBridge().catch((error: unknown) =>
      console.error("agent bridge detach failed", error),
    );
  };
}

function readPayload(payload: RequestPayload): RequestPayload | null {
  if (typeof payload?.requestId !== "number" || typeof payload.message !== "string") {
    console.error("agent request payload was malformed");
    return null;
  }
  return payload;
}
