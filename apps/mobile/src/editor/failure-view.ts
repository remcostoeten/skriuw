import { boundedFailureDetail, type EditorFailureCode } from "./protocol";

/**
 * The recoverable surface the host shows instead of a blank webview. Every
 * cause is named, because a silent editor is indistinguishable from a lost
 * document and recovery-relevant failures stay visible
 * (`apps/docs/content/v2/specs/mobile-app.md`, R-Q1).
 */

export type EditorHostFailureCode =
  | EditorFailureCode
  /** The webview's own process was killed by the platform. */
  | "webview-gone"
  /** No built editor page is packaged with this build. */
  | "bundle-missing";

export type EditorFailureView = {
  code: EditorHostFailureCode;
  summary: string;
  detail: string;
};

const SUMMARIES: Record<EditorHostFailureCode, string> = {
  "protocol-version": "The editor speaks a different protocol version",
  "invalid-message": "The editor refused a message from the app",
  "change-unacknowledged": "An edit was not acknowledged in time",
  "request-unanswered": "The editor is waiting on the app",
  "runtime-error": "The editor stopped responding",
  "webview-gone": "The system reclaimed the editor",
  "bundle-missing": "This build has no editor page",
};

export function describeEditorFailure(
  code: EditorHostFailureCode,
  detail: string,
): EditorFailureView {
  return { code, summary: SUMMARIES[code], detail: boundedFailureDetail(detail) };
}

/**
 * Whether reloading the webview can clear the cause. A missing bundle cannot
 * be reloaded into existence, so its surface offers no retry.
 */
export function isReloadable(view: EditorFailureView): boolean {
  return view.code !== "bundle-missing";
}
