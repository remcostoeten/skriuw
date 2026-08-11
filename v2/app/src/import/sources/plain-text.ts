import type { MarkdownTree } from "@/export/markdown-transfer-model";
import type { ImportBundle, ImportSourceAdapter } from "@/import/model";
import { noteTitleFromPath } from "@/import/model";

function isTextFile(relativePath: string): boolean {
  return /\.txt$/i.test(relativePath);
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes = tree.files
    .filter((file) => isTextFile(file.relativePath))
    .map((file) => ({
      relativePath: file.relativePath,
      title: noteTitleFromPath(file.relativePath),
      markdown: file.content,
    }));
  return {
    sourceId: plainTextSource.id,
    sourceLabel: plainTextSource.label,
    directories: tree.directories,
    notes,
    warnings: [],
  };
}

export const plainTextSource: ImportSourceAdapter = {
  id: "plain-text",
  label: "Plain text",
  detect(tree) {
    const textFiles = tree.files.filter((file) => isTextFile(file.relativePath)).length;
    if (textFiles === 0) {
      return 0;
    }
    return textFiles === tree.files.length ? 0.5 : 0.05;
  },
  parse,
};
