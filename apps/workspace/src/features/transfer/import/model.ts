import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";

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

export function noteTitleFromContent(content: string, fallback: string): string {
  const firstLine = content.split("\n", 1)[0]?.replace(/^#+\s*/, "").trim() ?? "";
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

export async function importSourceKey(sourcePath: string): Promise<string> {
  const canonical = sourcePath.replaceAll("\\", "/").replace(/\/+$/, "");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
