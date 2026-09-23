import { appRouteHash, journalDayHash } from "@skriuw/renderer-core/route/app-route";
import { todayKey } from "@skriuw/renderer-core/journal/dates";
import {
  planMarkdownImport,
  sanitizeFileName,
} from "@/features/transfer/export/markdown-transfer-model";
import { commitOperations, createNote } from "@/store/actions/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

const CAPTURE_KEY = "capture";
const SHARE_KEYS = ["title", "text", "url"] as const;
const TITLE_LIMIT = 80;
const FALLBACK_TITLE = "Shared note";

export type LaunchCapture =
  | { kind: "note" }
  | { kind: "journal" }
  | { kind: "share"; title: string; text: string; url: string };

/**
 * Reads the intent an installed app's manifest shortcut (`?capture=note`,
 * `?capture=journal`) or the system share sheet (`?title=&text=&url=`) put in
 * the launch URL. Unrelated query keys, such as the onboarding debug switches,
 * are ignored.
 */
export function parseLaunchCapture(search: string): LaunchCapture | null {
  const params = new URLSearchParams(search);
  const capture = params.get(CAPTURE_KEY);
  if (capture === "note" || capture === "journal") {
    return { kind: capture };
  }
  const title = (params.get("title") ?? "").trim();
  const text = (params.get("text") ?? "").trim();
  const url = (params.get("url") ?? "").trim();
  if (title.length === 0 && text.length === 0 && url.length === 0) {
    return null;
  }
  if (url.length === 0 && isBareUrl(text)) {
    return { kind: "share", title, text: "", url: text };
  }
  return { kind: "share", title, text, url };
}

/** The launch URL with every capture parameter removed, so a reload does not capture twice. */
export function stripLaunchCapture(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(CAPTURE_KEY);
  for (const key of SHARE_KEYS) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

/**
 * Turns a share payload into a note. The title is the shared title, else the
 * first line of the text, else the link's host; the body keeps the text as
 * paragraphs and adds the link once when the text does not already carry it.
 */
export function shareNoteMarkdown(share: { title: string; text: string; url: string }): {
  title: string;
  markdown: string;
} {
  const title = shareTitle(share);
  const paragraphs = share.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  if (share.url.length > 0 && !share.text.includes(share.url)) {
    const label = share.title.length > 0 ? share.title : share.url;
    paragraphs.push(`[${label}](${share.url})`);
  }
  const body = paragraphs.join("\n\n");
  return { title, markdown: body.length > 0 ? `# ${title}\n\n${body}\n` : `# ${title}\n` };
}

function shareTitle(share: { title: string; text: string; url: string }): string {
  if (share.title.length > 0) {
    return truncate(share.title);
  }
  const firstLine = share.text.split("\n").find((line) => line.trim().length > 0);
  if (firstLine !== undefined && !isBareUrl(firstLine)) {
    return truncate(firstLine.trim());
  }
  const host = urlHost(share.url);
  return host ?? FALLBACK_TITLE;
}

function truncate(value: string): string {
  return value.length > TITLE_LIMIT ? `${value.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : value;
}

function isBareUrl(value: string): boolean {
  return /^https?:\/\/\S+$/u.test(value.trim());
}

function urlHost(value: string): string | null {
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

/**
 * Carries out a launch capture on a bootstrapped store. Local state updates
 * synchronously like any renderer action, so the shell can render at once
 * while the durable write completes behind it.
 */
export function applyLaunchCapture(store: RendererStore, capture: LaunchCapture): Promise<void> {
  if (capture.kind === "journal") {
    window.location.hash = journalDayHash(todayKey());
    return Promise.resolve();
  }
  if (capture.kind === "note") {
    createNote(store, null);
    window.location.hash = appRouteHash("notes");
    return Promise.resolve();
  }
  const { title, markdown } = shareNoteMarkdown(capture);
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [{ relativePath: `${sanitizeFileName(title)}.md`, content: markdown }],
      skipped: 0,
    },
    Date.now(),
    () => crypto.randomUUID(),
  );
  const noteId = plan.notes[0]?.id ?? null;
  window.location.hash = appRouteHash("notes");
  return commitOperations(store, [
    ...plan.operations,
    ...plan.contentOperations,
    { type: "set_active_note", noteId },
  ]);
}
