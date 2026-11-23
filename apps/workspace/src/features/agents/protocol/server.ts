import { ToolInput, ToolRefusal } from "./input";
import { isJsonObject, parseJson, type FrozenJson, type JsonObject, type JsonValue } from "./json";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
};

export type AgentTool<Context> = {
  name: string;
  title: string;
  description: string;
  inputSchema: { readonly [key: string]: FrozenJson };
  annotations: ToolAnnotations;
  run: (input: ToolInput, context: Context) => Promise<JsonValue>;
};

export type ServerIdentity = {
  version: string;
  instructions: string;
};

export type AgentServer = {
  handle: (message: string) => Promise<string | null>;
};

type RpcId = string | number;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/**
 * @name createAgentServer
 * @description Builds the MCP request handler over a set of tools. Tool calls
 * run one at a time in arrival order, so an agent that fires several writes at
 * once sees each one land on the state the previous one left.
 *
 * @example
 * const server = createAgentServer(tools, () => context, { version: "1.0.0", instructions: "" });
 * const answer = await server.handle('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
 */
export function createAgentServer<Context>(
  tools: readonly AgentTool<Context>[],
  context: () => Context,
  identity: ServerIdentity,
): AgentServer {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  let tail: Promise<void> = Promise.resolve();

  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function callTool(params: JsonObject): Promise<JsonObject> {
    const name = params.name;
    const tool = typeof name === "string" ? byName.get(name) : undefined;
    if (tool === undefined) {
      throw new RpcError(INVALID_PARAMS, `Unknown tool: ${String(name)}`);
    }
    const args = params.arguments ?? {};
    if (!isJsonObject(args)) {
      throw new RpcError(INVALID_PARAMS, "Tool arguments must be an object.");
    }
    try {
      const result = await serialized(() => tool.run(new ToolInput(args), context()));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const message =
        error instanceof ToolRefusal
          ? error.message
          : `Skriuw could not finish ${tool.name}: ${error instanceof Error ? error.message : String(error)}`;
      if (!(error instanceof ToolRefusal)) console.error(`agent tool ${tool.name} failed`, error);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  }

  async function dispatch(method: string, params: JsonObject): Promise<FrozenJson> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: negotiateVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "skriuw", title: "Skriuw", version: identity.version },
          instructions: identity.instructions,
        };
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: tools.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: { title: tool.title, ...tool.annotations },
          })),
        };
      case "tools/call":
        return callTool(params);
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }

  async function handle(text: string): Promise<string | null> {
    const message = parseJson(text);
    if (message === null) return failure(null, PARSE_ERROR, "Parse error");
    if (!isJsonObject(message)) return failure(null, INVALID_REQUEST, "Invalid request");
    const id = readId(message.id);
    const method = message.method;
    if (typeof method !== "string") {
      return id === undefined ? null : failure(id, INVALID_REQUEST, "Invalid request");
    }
    if (id === undefined) return null;
    const params = message.params ?? {};
    if (!isJsonObject(params)) return failure(id, INVALID_PARAMS, "Params must be an object.");
    try {
      return JSON.stringify({ jsonrpc: "2.0", id, result: await dispatch(method, params) });
    } catch (error) {
      if (error instanceof RpcError) return failure(id, error.code, error.message);
      console.error(`agent request ${method} failed`, error);
      return failure(id, -32603, "Internal error");
    }
  }

  return { handle };
}

class RpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function readId(value: JsonValue | undefined): RpcId | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function negotiateVersion(requested: JsonValue | undefined): string {
  const supported = SUPPORTED_PROTOCOL_VERSIONS.find((version) => version === requested);
  return supported ?? SUPPORTED_PROTOCOL_VERSIONS[0];
}

function failure(id: RpcId | null, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}
