"use dom";

import { useDOMImperativeHandle, type DOMProps } from "expo/dom";
import { useEffect, useRef, type Ref } from "react";

/**
 * The persistent editor webview. Expo renders this module as a DOM component,
 * and the component embeds the built editor page from Mobile 05 as a
 * same-origin document: the editor is a Vite bundle of the desktop feature,
 * not a module Metro can compile, and it must stay unforked (R-A6).
 *
 * Everything that crosses the native boundary is a string, because DOM
 * component props and messages must be serializable. The relay is the same
 * shape the browser harness proved (`app/harnesses/editor-host/host.ts`):
 * `transport.ts` inside the page talks to its parent frame, this component
 * talks to the host.
 */

/**
 * `DOMImperativeFactory` declares every method as taking `JSONValue`
 * arguments, so the parameter is widened to satisfy that constraint. Only the
 * JSON text of one `HostToEditorMessage` is ever delivered.
 */
export type EditorSurfaceHandle = {
  deliver: (text: unknown) => void;
};

type Props = {
  /** Same-origin path of the built editor page, from `resolveEditorBundle`. */
  source: string;
  /** Painted behind the page so a cold frame never flashes white. */
  background: string;
  /** Receives the JSON text of one `EditorToHostMessage`. */
  onEditorMessage: (text: string) => Promise<void>;
  dom?: DOMProps;
  ref?: Ref<EditorSurfaceHandle>;
};

const SURFACE_CSS = `
  html, body { margin: 0; padding: 0; height: 100%; background: transparent; overscroll-behavior: none; }
  .skriuw-editor-frame { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
`;

export default function EditorSurface({ source, background, onEditorMessage, ref }: Props) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const relay = useRef(onEditorMessage);

  useEffect(() => {
    relay.current = onEditorMessage;
  }, [onEditorMessage]);

  useDOMImperativeHandle<EditorSurfaceHandle>(
    ref ?? null,
    () => ({
      deliver: (text: unknown) => {
        if (typeof text !== "string") {
          throw new Error(`the editor host delivers JSON text, not ${typeof text}`);
        }
        frame.current?.contentWindow?.postMessage(text, window.location.origin);
      },
    }),
    [],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      const text = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
      void relay.current(text);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      <style>{SURFACE_CSS}</style>
      <iframe
        ref={frame}
        className="skriuw-editor-frame"
        src={source}
        title="Skriuw editor"
        style={{ background }}
      />
    </>
  );
}
