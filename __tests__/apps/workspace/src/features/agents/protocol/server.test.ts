import { describe, expect, test } from "vitest";
import { createAgentServer } from "@/features/agents/protocol/server";
import { createHarness } from "../harness";

describe("agent MCP protocol", () => {
  test("initialize answers with the requested supported version and the tools capability", async () => {
    const harness = createHarness();
    const answer = (await harness.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    })) as {
      result: { protocolVersion: string; capabilities: unknown; serverInfo: { name: string } };
    };
    expect(answer.result.protocolVersion).toBe("2025-03-26");
    expect(answer.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(answer.result.serverInfo.name).toBe("skriuw");
  });

  test("an unknown protocol version is answered with the newest supported one", async () => {
    const answer = (await createHarness().rpc("initialize", { protocolVersion: "1999-01-01" })) as {
      result: { protocolVersion: string };
    };
    expect(answer.result.protocolVersion).toBe("2025-06-18");
  });

  test("tools/list describes every tool with an object input schema", async () => {
    const answer = (await createHarness().rpc("tools/list")) as {
      result: {
        tools: {
          name: string;
          inputSchema: { type: string };
          annotations: { readOnlyHint: boolean };
        }[];
      };
    };
    const names = answer.result.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_workspace",
        "create_note",
        "move_items",
        "create_task",
        "update_task",
        "create_database",
        "set_properties",
      ]),
    );
    for (const tool of answer.result.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
    }
  });

  test("notifications get no answer and unknown methods a JSON-RPC error", async () => {
    const harness = createHarness();
    const server = createAgentServer([], () => null, { version: "1", instructions: "" });
    expect(
      await server.handle('{"jsonrpc":"2.0","method":"notifications/initialized"}'),
    ).toBeNull();
    const unknown = (await harness.rpc("resources/list")) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
    expect(JSON.parse((await server.handle("{"))!).error.code).toBe(-32700);
  });

  test("a refused tool call is a tool error the agent can read, not a protocol error", async () => {
    const answer = await createHarness().call("read_note", { noteId: "missing" });
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain("missing");
  });

  test("arguments that break the schema are refused with the field name", async () => {
    const answer = await createHarness().call("create_folder", { title: 42 });
    expect(answer.isError).toBe(true);
    expect(answer.text).toBe("title must be a string.");
  });

  test("calls run one at a time in arrival order", async () => {
    const order: string[] = [];
    const server = createAgentServer(
      [
        {
          name: "slow",
          title: "Slow",
          description: "",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
          async run() {
            await new Promise((resolve) => setTimeout(resolve, 20));
            order.push("slow");
            return null;
          },
        },
        {
          name: "fast",
          title: "Fast",
          description: "",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
          async run() {
            order.push("fast");
            return null;
          },
        },
      ],
      () => null,
      { version: "1", instructions: "" },
    );
    function request(id: number, name: string) {
      return server.handle(
        JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name } }),
      );
    }
    await Promise.all([request(1, "slow"), request(2, "fast")]);
    expect(order).toEqual(["slow", "fast"]);
  });
});
