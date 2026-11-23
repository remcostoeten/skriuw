import type {
  SearchHit,
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceOperation,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { ToolContext } from "@/features/agents/context";
import { createAgentServer } from "@/features/agents/protocol/server";
import { AGENT_INSTRUCTIONS, AGENT_TOOLS } from "@/features/agents/tools";
import { parseProductMarkdown, serializeProductMarkdown } from "@/features/editor/schema";

export type Seed = {
  id: string;
  kind: "note" | "folder";
  title: string;
  parentId?: string | null;
  markdown?: string;
  deletedAt?: number | null;
  lockedAt?: number | null;
};

export type ToolAnswer = { isError: boolean; text: string; data: unknown };

export type Harness = {
  store: RendererStore;
  operations: WorkspaceOperation[];
  references: ReferenceOperation[];
  rpc: (method: string, params?: unknown) => Promise<unknown>;
  call: (name: string, args?: unknown) => Promise<ToolAnswer>;
  ok: (name: string, args?: unknown) => Promise<any>;
};

function node(seed: Seed, rank: number): WorkspaceNode {
  return {
    id: seed.id,
    kind: seed.kind,
    parentId: seed.parentId ?? null,
    rank,
    title: seed.title,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: seed.deletedAt ?? null,
    pinnedAt: null,
    lockedAt: seed.lockedAt ?? null,
  };
}

function document(seed: Seed): WorkspaceDocument {
  const parsed = parseProductMarkdown(seed.markdown ?? `# ${seed.title}\n`);
  return {
    noteId: seed.id,
    documentJson: parsed.toJSON(),
    markdown: serializeProductMarkdown(parsed),
    revision: 1,
    wordCount: 1,
  };
}

function snapshot(seeds: readonly Seed[]): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: seeds.map((seed, index) => node(seed, (index + 1) * 100)),
    documents: seeds.filter((seed) => seed.kind === "note").map(document),
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "",
    },
    tags: [],
    people: [],
    references: [],
  };
}

export function createHarness(
  seeds: readonly Seed[] = [],
  hits: readonly SearchHit[] = [],
): Harness {
  const store = createRendererStore(createInitialState(snapshot(seeds)));
  const operations: WorkspaceOperation[] = [];
  const references: ReferenceOperation[] = [];
  let ids = 0;
  let clock = 1_000;
  const context: ToolContext = {
    store,
    async commit(batch) {
      operations.push(...batch);
      store.applyOperations(batch);
    },
    commitReferences(batch) {
      references.push(...batch);
      store.applyReferenceOperations(batch);
    },
    flush: async () => undefined,
    search: async () => [...hits],
    now: () => (clock += 1),
    createId: () => `id-${(ids += 1)}`,
  };
  const server = createAgentServer(AGENT_TOOLS, () => context, {
    version: "test",
    instructions: AGENT_INSTRUCTIONS,
  });
  let requestId = 0;

  async function rpc(method: string, params?: unknown): Promise<unknown> {
    const answer = await server.handle(
      JSON.stringify({ jsonrpc: "2.0", id: (requestId += 1), method, params }),
    );
    return answer === null ? null : JSON.parse(answer);
  }

  async function call(name: string, args: unknown = {}): Promise<ToolAnswer> {
    const answer = (await rpc("tools/call", { name, arguments: args })) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    const text = answer.result.content[0]!.text;
    const isError = answer.result.isError === true;
    return { isError, text, data: isError ? null : JSON.parse(text) };
  }

  async function ok(name: string, args: unknown = {}): Promise<any> {
    const answer = await call(name, args);
    if (answer.isError) throw new Error(`${name} failed: ${answer.text}`);
    return answer.data;
  }

  return { store, operations, references, rpc, call, ok };
}
