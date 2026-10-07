import type { MarkdownTree } from "@/features/transfer/import/parsing/tree";
import type { ImportBundle, ImportSourceAdapter } from "@/features/transfer/import/parsing/bundle";
import {
  noteTitleFromPath,
  titleFromLeadingHeading,
} from "@/features/transfer/import/parsing/bundle";
import { isTextBundleFile } from "./bear";

function isMarkdownFile(relativePath: string): boolean {
  return /\.(md|markdown)$/i.test(relativePath);
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes = tree.files
    .filter((file) => isMarkdownFile(file.relativePath) && !isTextBundleFile(file.relativePath))
    .map((file) => ({
      relativePath: file.relativePath,
      ...titleFromLeadingHeading(file.content, noteTitleFromPath(file.relativePath)),
    }));
  return {
    sourceId: markdownSource.id,
    sourceLabel: markdownSource.label,
    directories: tree.directories.filter((path) => !/\.textbundle(\/|$)/i.test(path)),
    notes,
    warnings: [],
  };
}

export const markdownSource: ImportSourceAdapter = {
  id: "markdown",
  label: "Markdown",
  detect(tree) {
    return tree.files.some((file) => isMarkdownFile(file.relativePath)) ? 0.1 : 0;
  },
  parse,
};
