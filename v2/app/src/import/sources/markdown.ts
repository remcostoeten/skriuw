import type { MarkdownTree } from "../../export/markdown-transfer-model";
import type { ImportBundle, ImportSourceAdapter } from "../model";
import { noteTitleFromPath } from "../model";
import { isTextBundleFile } from "./bear";

function isMarkdownFile(relativePath: string): boolean {
  return /\.(md|markdown)$/i.test(relativePath);
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes = tree.files
    .filter((file) => isMarkdownFile(file.relativePath) && !isTextBundleFile(file.relativePath))
    .map((file) => ({
      relativePath: file.relativePath,
      title: noteTitleFromPath(file.relativePath),
      markdown: file.content,
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
