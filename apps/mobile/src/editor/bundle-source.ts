/**
 * Where the built editor page lives inside the DOM component's own origin.
 *
 * The editor is the desktop bundle, unforked (`docs/specs/mobile-app.md`,
 * R-A6): a Vite build of `apps/workspace/src/features/editor-standalone`, not a module
 * Metro can bundle. `bun run editor:page` emits it into `apps/mobile/public/editor/`,
 * which `expo export:embed` copies into `www.bundle/` beside the DOM component's
 * own page, and the Expo dev server serves at its root. The DOM component
 * therefore embeds it as a same-origin document and relays protocol messages,
 * exactly as the browser harness in `apps/workspace/harnesses/editor-host` does.
 */

export type EditorBundleSource = { ok: true; uri: string } | { ok: false; detail: string };

export type EditorPageServer = "dev-server" | "embedded";

/** Overrides where the packaged page is served from; unset means none is packaged. */
export const EDITOR_ENTRY_VARIABLE = "EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY";

const MISSING = `No editor page is packaged with this build. Run bun run editor:page in apps/mobile and set ${EDITOR_ENTRY_VARIABLE} to the page's path inside public/.`;

function isAbsoluteUrl(entry: string): boolean {
  return entry.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(entry);
}

export function resolveEditorBundle(
  configured: string | undefined,
  server: EditorPageServer,
): EditorBundleSource {
  const entry = configured?.trim() ?? "";
  if (entry === "") {
    return { ok: false, detail: MISSING };
  }
  if (isAbsoluteUrl(entry)) {
    return {
      ok: false,
      detail: `${EDITOR_ENTRY_VARIABLE} must be a path inside public/, not ${entry}. The editor answers only its own origin.`,
    };
  }
  // Strips any leading "./" or "/" so the path is relative to public/.
  const path = entry.replace(/^(\.\/|\/)+/, "");
  return { ok: true, uri: server === "dev-server" ? `/${path}` : path };
}
