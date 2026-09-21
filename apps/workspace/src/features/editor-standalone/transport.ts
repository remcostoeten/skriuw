import type { EditorToHostMessage } from "../../../../mobile/src/editor/protocol.ts";

type ReactNativeWebViewBridge = { postMessage: (text: string) => void };

export type EditorTransport = {
  send: (message: EditorToHostMessage) => void;
  listen: (receive: (raw: unknown) => void) => () => void;
};

function reactNativeBridge(): ReactNativeWebViewBridge | null {
  const bridge = (window as { ReactNativeWebView?: ReactNativeWebViewBridge }).ReactNativeWebView;
  return bridge ?? null;
}

/**
 * Picks the channel the page was embedded with: the React Native webview
 * bridge when it is injected, otherwise the same-origin parent frame the
 * browser harness uses. Frames from any other origin are never answered.
 */
export function windowTransport(): EditorTransport {
  const native = reactNativeBridge();
  return {
    send: (message) => {
      if (native) {
        native.postMessage(JSON.stringify(message));
        return;
      }
      if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
    },
    listen: (receive) => {
      function onMessage(event: Event): void {
        if (!(event instanceof MessageEvent)) return;
        const fromHost = native
          ? event.source === null || event.source === window
          : event.source === window.parent && event.origin === window.location.origin;
        if (fromHost) receive(event.data);
      }
      window.addEventListener("message", onMessage);
      // Android's webview dispatches host messages on `document`, iOS on `window`.
      document.addEventListener("message", onMessage);
      return () => {
        window.removeEventListener("message", onMessage);
        document.removeEventListener("message", onMessage);
      };
    },
  };
}
