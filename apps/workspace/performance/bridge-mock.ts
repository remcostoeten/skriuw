import type { OperationAck, SearchHit } from "@skriuw/renderer-core/contracts/workspace";

type BridgeCall = {
  command: string;
  at: number;
};

type InvokeArguments = {
  query?: string;
  limit?: number;
  operations?: { operation: { type: string; noteId?: string; expectedRevision?: number } }[];
};

const calls: BridgeCall[] = [];
let searchHits: ReadonlyMap<string, readonly SearchHit[]> = new Map();

export function resetBridgeCalls(): void {
  calls.length = 0;
}

export function readBridgeCalls(): string[] {
  return calls.map((call) => call.command);
}

export function readBridgeCallTimes(command: string): number[] {
  return calls.filter((call) => call.command === command).map((call) => call.at);
}

export function setSearchHits(hits: ReadonlyMap<string, readonly SearchHit[]>): void {
  searchHits = hits;
}

function search(parameters: InvokeArguments | undefined): SearchHit[] {
  const query = parameters?.query?.trim().toLowerCase() ?? "";
  const limit = parameters?.limit ?? 100;
  return [...(searchHits.get(query) ?? [])].slice(0, limit);
}

function acknowledge(parameters: InvokeArguments | undefined): OperationAck {
  const operations = parameters?.operations ?? [];
  const revisions = operations.flatMap(({ operation }) =>
    operation.type === "save_document" && operation.noteId !== undefined
      ? [{ id: operation.noteId, revision: (operation.expectedRevision ?? 0) + 1 }]
      : [],
  );
  return { applied: operations.length, revisions, rankChanges: [] };
}

export function invoke<T>(command: string, parameters?: InvokeArguments): Promise<T> {
  calls.push({ command, at: performance.now() });
  performance.mark(`bridge:${command}`);
  if (
    command === "load_auth_token" ||
    command === "active_workspace_slot" ||
    command === "save_pane_layout" ||
    command === "save_sidebar_expansion"
  ) {
    return Promise.resolve(null as T);
  }
  if (command === "plugin:event|listen" || command === "plugin:event|unlisten") {
    return Promise.resolve(0 as T);
  }
  if (command === "search_index_status") {
    return Promise.resolve({
      indexVersion: 1,
      currentVersion: 1,
      indexedNotes: 0,
      noteCount: 0,
      needsRebuild: false,
    } as T);
  }
  if (command === "search_workspace") {
    return Promise.resolve(search(parameters) as T);
  }
  if (command === "apply_workspace_operations") {
    return Promise.resolve(acknowledge(parameters) as T);
  }
  return Promise.reject(new Error(`unexpected performance bridge call: ${command}`));
}

export { Channel, convertFileSrc } from "../node_modules/@tauri-apps/api/core.js";
