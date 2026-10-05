import { AppState } from "react-native";
import type { LifecyclePort } from "./lifecycle";
import type { WakeSocket, WakeSocketHandlers, WakeTimer } from "./wake-channel";

const SYNC_EVENTS_SUBPROTOCOL = "skriuw-sync-v1";

/** Foreground is `AppState` reporting `active`; `inactive` already means leaving. */
export function createForegroundPort(): LifecyclePort<boolean> {
  return {
    current: () => AppState.currentState === "active",
    subscribe: (listener) => {
      const subscription = AppState.addEventListener("change", (status) => {
        listener(status === "active");
      });
      return () => subscription.remove();
    },
  };
}

/**
 * There is no reachability module in this build, so the hint stays online.
 * Offline is scheduling advice to the coordinator, never a gate, and a failed
 * cycle reports `offline` on its own.
 */
export function createOnlinePort(): LifecyclePort<boolean> {
  return {
    current: () => true,
    subscribe: () => () => undefined,
  };
}

export const platformWakeTimer: WakeTimer = {
  schedule(delayMs, run) {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
};

type HeaderWebSocket = new (
  url: string,
  protocols: string[],
  options: { headers: Record<string, string> },
) => WebSocket;

// The DOM typing omits the options argument that React Native's constructor accepts.
const NativeWebSocket: HeaderWebSocket = WebSocket;

/**
 * React Native's `WebSocket` takes a third argument with handshake headers,
 * so the bearer travels as `Authorization` like every other sync request
 * rather than in the subprotocol the browser runtime has to use.
 */
export function platformWakeSocket(
  url: string,
  bearer: string,
  handlers: WakeSocketHandlers,
): WakeSocket {
  const socket = new NativeWebSocket(url, [SYNC_EVENTS_SUBPROTOCOL], {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  let opened = false;
  socket.onopen = () => {
    opened = true;
    handlers.onOpen();
  };
  socket.onmessage = (event) => handlers.onMessage(String(event.data));
  socket.onclose = () => handlers.onClose(opened);
  return { close: () => socket.close() };
}
