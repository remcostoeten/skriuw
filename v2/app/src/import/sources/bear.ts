import type { MarkdownTree } from "../../export/markdown-transfer-model";
import type { ImportBundle, ImportSourceAdapter, ImportedNote } from "../model";

const TEXT_BUNDLE_NOTE = /^(.*?)([^/]+)\.textbundle\/text\.(md|markdown)$/i;

export function isTextBundleFile(relativePath: string): boolean {
  return /\.textbundle\//i.test(relativePath);
}

/**
 * The note is hoisted out of its bundle directory, so bundle-relative asset
 * links must point back into the bundle for image resolution to find them.
 */
function rewriteAssetPaths(markdown: string, bundleName: string): string {
  return markdown.replaceAll("](assets/", `](${bundleName}.textbundle/assets/`);
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes: ImportedNote[] = [];
  for (const file of tree.files) {
    const match = TEXT_BUNDLE_NOTE.exec(file.relativePath);
    if (!match) {
      continue;
    }
    const prefix = match[1] ?? "";
    const bundleName = match[2] ?? "";
    notes.push({
      relativePath: `${prefix}${bundleName}.md`,
      title: bundleName,
      markdown: rewriteAssetPaths(file.content, bundleName),
    });
  }
  return {
    sourceId: bearSource.id,
    sourceLabel: bearSource.label,
    directories: tree.directories.filter((path) => !/\.textbundle(\/|$)/i.test(path)),
    notes,
    warnings: [],
  };
}

export const bearSource: ImportSourceAdapter = {
  id: "bear",
  label: "Bear",
  detect(tree) {
    return tree.files.some((file) => TEXT_BUNDLE_NOTE.test(file.relativePath)) ? 0.9 : 0;
  },
  parse,
};
