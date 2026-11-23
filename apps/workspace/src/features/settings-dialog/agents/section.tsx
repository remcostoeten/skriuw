import { useEffect, useState } from "react";
import {
  agentServerStatus,
  claudeCodeCommand,
  configureAgentServer,
  mcpClientConfig,
  rotateAgentServerToken,
  type AgentServerStatus,
} from "@/features/agents/commands";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import {
  SettingToggle,
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsRowDescription,
  settingsSection,
  settingsTextInput,
} from "@/shared/ui/settings-controls";
import { showToast } from "@/shared/ui/toast";

const codeBlock =
  "m-0 max-h-48 w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-theme-divider bg-theme-deep px-3 py-2 font-mono text-xs select-text";

function copy(text: string, what: string): void {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => showToast({ message: `Copied ${what}` }))
    .catch((error: unknown) =>
      showToast({
        message: `Could not copy ${what}: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
}

function statusText(status: AgentServerStatus): string {
  if (status.error !== null) return status.error;
  if (!status.enabled) return "Off. Agents cannot reach this workspace.";
  return status.running
    ? `Listening on ${status.url}, reachable only from this computer.`
    : "Starting…";
}

export function AgentsSection() {
  const [status, setStatus] = useState<AgentServerStatus | null>(null);
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let live = true;
    agentServerStatus()
      .then((current) => {
        if (!live) return;
        setStatus(current);
        setPort(String(current.port));
      })
      .catch((error: unknown) =>
        showToast({ message: `Agent access could not be read. ${String(error)}` }),
      );
    return () => {
      live = false;
    };
  }, []);

  function apply(work: () => Promise<AgentServerStatus>): void {
    setBusy(true);
    work()
      .then((current) => {
        setStatus(current);
        setPort(String(current.port));
      })
      .catch((error: unknown) => showToast({ message: String(error) }))
      .finally(() => setBusy(false));
  }

  function savePort(): void {
    if (status === null) return;
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1024 || value > 65_535) {
      showToast({ message: "Choose a port from 1024 to 65535." });
      setPort(String(status.port));
      return;
    }
    if (value !== status.port) apply(() => configureAgentServer(status.enabled, value));
  }

  if (status === null) {
    return <p className="text-sm text-theme-secondary">Loading agent access…</p>;
  }

  const token = revealed ? status.token : `${status.token.slice(0, 6)}${"•".repeat(20)}`;

  return (
    <section aria-label="Agent access preferences" className={settingsSection}>
      <SettingsGroup
        id="agent-access"
        title="Agent access"
        keywords="mcp model context protocol claude code codex cursor agent automation api local server"
      >
        <SettingToggle
          label="Let agents use this workspace"
          detail="Runs a local MCP server that coding agents such as Claude Code connect to. They can read and organise notes, tasks and databases while Skriuw is open. Deleting only moves things to the trash, and locked notes stay closed to them."
          checked={status.enabled}
          disabled={busy}
          onChange={(enabled) => apply(() => configureAgentServer(enabled, status.port))}
        />
        <SettingsRow label="Status" detail={statusText(status)} />
        <SettingsRow label="Port" detail="Agents connect to this port on 127.0.0.1.">
          <input
            aria-label="Agent access port"
            className={`${settingsTextInput} w-24`}
            inputMode="numeric"
            value={port}
            disabled={busy}
            onChange={(event) => setPort(event.currentTarget.value.replace(/\D/g, "").slice(0, 5))}
            onBlur={savePort}
            onKeyDown={(event) => {
              if (event.key === "Enter") savePort();
            }}
          />
        </SettingsRow>
      </SettingsGroup>
      {status.enabled && (
        <SettingsGroup
          id="agent-connect"
          title="Connect an agent"
          keywords="token bearer config json"
        >
          <SettingsRow
            label="Claude Code"
            detail="Run this once in a terminal."
            stack
            notes={<pre className={codeBlock}>{claudeCodeCommand(status)}</pre>}
          >
            <button
              type="button"
              className={settingsButton}
              onClick={() => copy(claudeCodeCommand(status), "the Claude Code command")}
            >
              Copy command
            </button>
          </SettingsRow>
          <SettingsRow
            label="Other MCP clients"
            detail="Add this entry to the client's MCP configuration. It uses the Streamable HTTP transport with a bearer token."
            stack
            notes={<pre className={codeBlock}>{mcpClientConfig(status)}</pre>}
          >
            <button
              type="button"
              className={settingsButton}
              onClick={() => copy(mcpClientConfig(status), "the MCP configuration")}
            >
              Copy configuration
            </button>
          </SettingsRow>
          <SettingsRow
            label="Access token"
            detail="Anyone with this token and access to this computer can change your workspace. A new token disconnects every agent set up with the old one."
            notes={<span className={`${settingsRowDescription} font-mono break-all`}>{token}</span>}
          >
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                className={settingsButton}
                onClick={() => setRevealed(!revealed)}
              >
                {revealed ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className={settingsButton}
                onClick={() => copy(status.token, "the token")}
              >
                Copy
              </button>
              <InlineConfirm
                confirmLabel="Replace token"
                message="Connected agents stop working."
                onConfirm={() => apply(rotateAgentServerToken)}
                renderIdle={(arm) => (
                  <button type="button" className={settingsButton} disabled={busy} onClick={arm}>
                    New token
                  </button>
                )}
              />
            </span>
          </SettingsRow>
        </SettingsGroup>
      )}
    </section>
  );
}
