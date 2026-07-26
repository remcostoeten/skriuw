import type { MarkdownTree } from "../export/markdown-transfer-model";

export type ImportedNote = {
  relativePath: string;
  title: string;
  markdown: string;
  tags?: string[];
  createdAt?: number;
  modifiedAt?: number;
};

export type ImportWarning = {
  message: string;
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
