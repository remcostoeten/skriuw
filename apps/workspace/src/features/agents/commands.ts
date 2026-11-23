import { invoke, requireDesktopRuntime } from "@/platform/runtime/runtime";

export const AGENT_REQUEST_EVENT = "agent-server-request";

export type AgentServerStatus = {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  token: string;
  error: string | null;
};

/**
 * @name agentServerStatus
 * @description Reads whether agent access is on, where it listens and the
 * token agents present.
 *
 * @example
 * const status = await agentServerStatus();
 */
export function agentServerStatus(): Promise<AgentServerStatus> {
  requireDesktopRuntime("Agent access");
  return invoke<AgentServerStatus>("agent_server_status");
}

/**
 * @name configureAgentServer
 * @description Turns agent access on or off and sets its port, starting or
 * stopping the local endpoint to match.
 *
 * @example
 * await configureAgentServer(true, 41783);
 */
export function configureAgentServer(enabled: boolean, port: number): Promise<AgentServerStatus> {
  requireDesktopRuntime("Agent access");
  return invoke<AgentServerStatus>("configure_agent_server", { enabled, port });
}

/**
 * @name rotateAgentServerToken
 * @description Replaces the access token, so agents configured with the old
 * one are refused.
 *
 * @example
 * await rotateAgentServerToken();
 */
export function rotateAgentServerToken(): Promise<AgentServerStatus> {
  requireDesktopRuntime("Agent access");
  return invoke<AgentServerStatus>("rotate_agent_server_token");
}

export function attachAgentBridge(): Promise<void> {
  return invoke<void>("attach_agent_bridge");
}

export function detachAgentBridge(): Promise<void> {
  return invoke<void>("detach_agent_bridge");
}

export function answerAgentRequest(requestId: number, answer: string): Promise<boolean> {
  return invoke<boolean>("answer_agent_request", { requestId, answer });
}

/**
 * @name claudeCodeCommand
 * @description The shell command that registers this workspace with Claude
 * Code as an MCP server.
 *
 * @example
 * claudeCodeCommand(status); // claude mcp add --transport http skriuw ...
 */
export function claudeCodeCommand(status: Pick<AgentServerStatus, "url" | "token">): string {
  return `claude mcp add --transport http skriuw ${status.url} --header "Authorization: Bearer ${status.token}"`;
}

/**
 * @name mcpClientConfig
 * @description The JSON entry for MCP clients configured through a file, such
 * as Cursor or Claude Desktop with a remote-server bridge.
 *
 * @example
 * mcpClientConfig(status);
 */
export function mcpClientConfig(status: Pick<AgentServerStatus, "url" | "token">): string {
  return JSON.stringify(
    {
      mcpServers: {
        skriuw: {
          type: "http",
          url: status.url,
          headers: { Authorization: `Bearer ${status.token}` },
        },
      },
    },
    null,
    2,
  );
}
