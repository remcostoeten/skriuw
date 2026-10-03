import { noop } from "@skriuw/shared/helpers/noop";
import { syncSession } from "./sync-session";

export type PushChannelConnection = {
  workspaceId: string;
  deviceId: string;
  token: string;
  baseUrl: string;
};

const PUSH_CHANNEL_MIN_RETRY_MS = 1_000;
const PUSH_CHANNEL_MAX_RETRY_MS = 60_000;
const SYNC_EVENTS_SUBPROTOCOL = "skriuw-sync-v1";

/**
 * Wake-hint WebSocket to the workspace events endpoint. Browsers cannot attach
 * an Authorization header to a WebSocket, so the bearer token rides a
 * `skriuw-bearer.<token>` subprotocol entry, percent-encoded because a signed
 * session token holds `/` and `=`, which the WebSocket constructor refuses. Every failure only schedules a
 * capped reconnect: correctness always comes from the polled sync cycle, and
 * the channel state only shapes how often that poll runs.
 */
/** The bearer token as a WebSocket subprotocol entry the service decodes. */
export function bearerSubprotocol(token: string): string {
  const encoded = encodeURIComponent(token).replace(
    /[()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `skriuw-bearer.${encoded}`;
}

export function openBrowserPushChannel(
  connection: PushChannelConnection,
  onWake: () => void,
  onChannelState: (connected: boolean) => void,
): () => void {
  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let retryDelayMs = PUSH_CHANNEL_MIN_RETRY_MS;
  let closed = false;

  function scheduleReconnect(): void {
    if (closed || retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      open();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, PUSH_CHANNEL_MAX_RETRY_MS);
  }

  function open(): void {
    if (closed) return;
    const token = syncSession().persistedToken() ?? connection.token;
    const url =
      connection.baseUrl.replace(/^http/, "ws") +
      `/v1/workspaces/${connection.workspaceId}/events?deviceId=${connection.deviceId}`;
    try {
      socket = new WebSocket(url, [SYNC_EVENTS_SUBPROTOCOL, bearerSubprotocol(token)]);
    } catch (error) {
      console.error("sync push channel could not connect", error);
      scheduleReconnect();
      return;
    }
    socket.onopen = () => {
      retryDelayMs = PUSH_CHANNEL_MIN_RETRY_MS;
      onChannelState(true);
    };
    socket.onmessage = (event) => {
      let message: { type?: string } | null = null;
      try {
        message = JSON.parse(String(event.data)) as { type?: string };
      } catch {
        noop();
      }
      if (message?.type === "workspaceChanged") onWake();
    };
    socket.onclose = () => {
      socket = null;
      onChannelState(false);
      scheduleReconnect();
    };
  }

  open();
  return () => {
    closed = true;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (socket !== null) {
      const activeSocket = socket;
      socket = null;
      activeSocket.onclose = null;
      activeSocket.close();
    }
    onChannelState(false);
  };
}
