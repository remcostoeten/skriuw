import {
  frameMessageOrigin,
  isFrameMessageOrigin,
  type EditorToHostMessage,
} from "../../../../mobile/src/editor/protocol.ts";

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
 * Picks the channel the page was embedded with: the parent frame when the page
 * is framed, as the Expo DOM component and the browser harness both do,
 * otherwise the React Native webview bridge. The native webviews inject their
 * bridge into every frame, so a framed page must ignore it or it would bypass
 * the host page. Frames from any other origin are never answered.
 */
export function windowTransport(): EditorTransport {
  const framed = window.parent !== window;
  const native = framed ? null : reactNativeBridge();
  const href = window.location.href;
  return {
    send: (message) => {
      if (native) {
        native.postMessage(JSON.stringify(message));
        return;
      }
      if (framed) window.parent.postMessage(message, frameMessageOrigin(href));
    },
    listen: (receive) => {
      function onMessage(event: Event): void {
        if (!(event instanceof MessageEvent)) return;
        const fromHost = native
          ? event.source === null || event.source === window
          : event.source === window.parent && isFrameMessageOrigin(event.origin, href);
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
