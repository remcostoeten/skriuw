import type { EditorSession } from "./editor-session";

let session: EditorSession | null = null;

export function installEditorSession(next: EditorSession): void {
  session = next;
}

/**
 * The session behind the swapped bridge modules. They are reached through
 * module imports the editor feature already owns, so the session is installed
 * once at startup instead of being threaded through the unforked editor.
 */
export function activeEditorSession(): EditorSession {
  if (!session) {
    throw new Error("The editor session is not installed yet.");
  }
  return session;
}
