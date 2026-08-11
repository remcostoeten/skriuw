import type { ImportBundle, ImportSourceAdapter } from "@/import/model";
import { noteTitleFromPath } from "@/import/model";

function parse(tree: Parameters<ImportSourceAdapter["parse"]>[0]): ImportBundle {
  const notes = tree.files
    .filter((file) => /\.(md|markdown)$/i.test(file.relativePath))
    .map((file) => ({
      relativePath: file.relativePath,
      title: noteTitleFromPath(file.relativePath),
      markdown: file.content,
    }));
  return {
    sourceId: appleNotesSource.id,
    sourceLabel: appleNotesSource.label,
    directories: tree.directories,
    notes,
    warnings: [],
  };
}

export const appleNotesSource: ImportSourceAdapter = {
  id: "apple-notes",
  label: "Apple Notes Markdown",
  detect(tree) {
    return tree.files.some((file) => /\.(md|markdown)$/i.test(file.relativePath))
      ? 0.09
      : 0;
  },
  parse,
};
