import type { MarkdownTree } from "@/features/transfer/import/parsing/tree";

export type ImportedPropertyValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "url"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "list"; values: string[] };

export type ImportedNoteProperty = {
  name: string;
  value: ImportedPropertyValue;
};

export type ImportedNote = {
  relativePath: string;
  title: string;
  markdown: string;
  tags?: string[];
  properties?: ImportedNoteProperty[];
  createdAt?: number;
  modifiedAt?: number;
  pinned?: boolean;
};

export type ImportWarning = {
  message: string;
  path?: string;
  severity?: "warning" | "error";
};

export type ImportBundle = {
  sourceId: string;
  sourceLabel: string;
  directories: string[];
  notes: ImportedNote[];
  warnings: ImportWarning[];
};

export type ImportSourceAdapter = {
  id: string;
  label: string;
  detect(tree: MarkdownTree): number;
  parse(tree: MarkdownTree): ImportBundle;
};

export function noteTitleFromPath(relativePath: string): string {
  const cut = relativePath.lastIndexOf("/");
  const fileName = cut === -1 ? relativePath : relativePath.slice(cut + 1);
  return fileName.replace(/\.(md|markdown|txt)$/i, "");
}

const LEADING_HEADING = /^\s*#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*(?:\r?\n|$)/;
const MAX_HEADING_TITLE_LENGTH = 200;

/**
 * @name titleFromLeadingHeading
 * @description Lifts the level-one heading a Markdown body opens with into the
 * note title and removes it from the body, so the title is not shown twice.
 * Bodies that open with anything else keep the fallback title unchanged.
 *
 * @example
 * titleFromLeadingHeading("# Roadmap\n\nShip it", "roadmap");
 * // { title: "Roadmap", markdown: "Ship it" }
 */
export function titleFromLeadingHeading(
  markdown: string,
  fallback: string,
): { title: string; markdown: string } {
  const heading = LEADING_HEADING.exec(markdown);
  const title = heading?.[1]?.trim() ?? "";
  if (!heading || title.length === 0 || title.length > MAX_HEADING_TITLE_LENGTH) {
    return { title: fallback, markdown };
  }
  return { title, markdown: markdown.slice(heading[0].length).replace(/^\s*\n/, "") };
}

/**
 * @name withFileTimes
 * @description Dates every imported note its source did not date with the
 * created and modified times of the file it was read from.
 *
 * @example
 * const dated = withFileTimes(source.parse(tree), tree);
 */
export function withFileTimes(bundle: ImportBundle, tree: MarkdownTree): ImportBundle {
  const files = new Map(tree.files.map((file) => [file.relativePath, file]));
  return {
    ...bundle,
    notes: bundle.notes.map((note) => {
      const file = files.get(note.relativePath);
      return {
        ...note,
        createdAt: note.createdAt ?? file?.createdAt ?? undefined,
        modifiedAt: note.modifiedAt ?? file?.modifiedAt ?? undefined,
      };
    }),
  };
}

export function noteTitleFromContent(content: string, fallback: string): string {
  const firstLine =
    content
      .split("\n", 1)[0]
      ?.replace(/^#+\s*/, "")
      .trim() ?? "";
  return firstLine.length > 0 ? firstLine.slice(0, 120) : fallback;
}

/**
 * Builds a note-relative link to a file located anywhere in the import tree;
 * segments are URI-encoded so spaces survive markdown link parsing.
 */
export function relativeLinkBetween(notePath: string, targetPath: string): string {
  const cut = notePath.lastIndexOf("/");
  const noteDirectories = cut === -1 ? [] : notePath.slice(0, cut).split("/");
  const targetSegments = targetPath.split("/");
  const targetDirectoryCount = targetSegments.length - 1;
  let common = 0;
  while (
    common < noteDirectories.length &&
    common < targetDirectoryCount &&
    noteDirectories[common] === targetSegments[common]
  ) {
    common += 1;
  }
  const climbs = Array(noteDirectories.length - common).fill("..");
  const descent = targetSegments.slice(common).map(encodeURIComponent);
  return [...climbs, ...descent].join("/");
}

export function detectImportSource(
  adapters: readonly ImportSourceAdapter[],
  tree: MarkdownTree,
): ImportSourceAdapter | null {
  let best: ImportSourceAdapter | null = null;
  let bestScore = 0;
  for (const adapter of adapters) {
    const score = adapter.detect(tree);
    if (score > bestScore) {
      best = adapter;
      bestScore = score;
    }
  }
  return best;
}

/**
 * @name contentHash
 * @description Returns the hex SHA-256 digest of a text.
 *
 * @example
 * await contentHash("# Todo");
 */
export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function importSourceKey(sourcePath: string): Promise<string> {
  return contentHash(sourcePath.replaceAll("\\", "/").replace(/\/+$/, ""));
}
