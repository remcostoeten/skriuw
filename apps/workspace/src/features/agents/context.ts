import type { SearchHit, WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

export type ToolContext = {
  store: RendererStore;
  commit: (operations: WorkspaceOperation[]) => Promise<void>;
  commitReferences: (operations: readonly ReferenceOperation[]) => void;
  flush: () => Promise<void>;
  search: (query: string, limit: number) => Promise<SearchHit[]>;
  now: () => number;
  createId: () => string;
};
