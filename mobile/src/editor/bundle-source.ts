/**
 * Where the built editor page lives inside the DOM component's own origin.
 *
 * The editor is the desktop bundle, unforked (`docs/specs/mobile-app.md`,
 * R-A6): a Vite build of `app/src/features/editor-standalone`, not a module
 * Metro can bundle. The DOM component therefore embeds it as a same-origin
 * document and relays protocol messages, exactly as the browser harness in
 * `app/harnesses/editor-host` does. Same-origin is a requirement, not a
 * preference: `transport.ts` posts to `window.location.origin` and answers
 * only its own origin, so a cross-origin page is never heard.
 */

export type EditorBundleSource = { ok: true; uri: string } | { ok: false; detail: string };

/** Overrides where the packaged page is served from; unset means none is packaged. */
export const EDITOR_ENTRY_VARIABLE = "EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY";

const MISSING = `No editor page is packaged with this build. Set ${EDITOR_ENTRY_VARIABLE} to the same-origin path of the built editor page.`;

function isAbsoluteUrl(entry: string): boolean {
  return entry.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(entry);
}

export function resolveEditorBundle(configured: string | undefined): EditorBundleSource {
  const entry = configured?.trim() ?? "";
  if (entry === "") {
    return { ok: false, detail: MISSING };
  }
  if (isAbsoluteUrl(entry)) {
    return {
      ok: false,
      detail: `${EDITOR_ENTRY_VARIABLE} must be a same-origin path, not ${entry}. The editor answers only its own origin.`,
    };
  }
  return { ok: true, uri: entry.startsWith("/") ? entry : `/${entry.replace(/^\.\//, "")}` };
}
