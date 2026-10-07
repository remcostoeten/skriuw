import { mdxToMarkdown } from "@/features/transfer/import/parsing/mdx";
import type { MarkdownTree } from "@/features/transfer/import/parsing/tree";

export type FileFormat = {
  id: string;
  label: string;
  extensions: readonly string[];
  toMarkdown?: (content: string) => string;
};

export const fileFormats: readonly FileFormat[] = [
  { id: "markdown", label: "Markdown", extensions: ["md", "markdown"] },
  { id: "mdx", label: "MDX", extensions: ["mdx"], toMarkdown: mdxToMarkdown },
  { id: "text", label: "Plain text", extensions: ["txt"] },
];

function extensionOf(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

/**
 * @name fileFormatForPath
 * @description Returns the format Skriuw reads a file as, picked by its
 * extension, or null for files no format covers. The desktop shell registers
 * the same extensions as file associations, so every file the operating
 * system opens in Skriuw has a format here.
 *
 * @example
 * fileFormatForPath("/home/me/Docs/Intro.MDX")?.id;
 * // "mdx"
 */
export function fileFormatForPath(path: string): FileFormat | null {
  const extension = extensionOf(path);
  return fileFormats.find((format) => extension && format.extensions.includes(extension)) ?? null;
}

/**
 * @name convertFormatsToMarkdown
 * @description Converts every file in an import tree whose format has its own
 * syntax to Markdown and renames it to `.md`, so the import sources read it
 * like any other note. A name already taken keeps the original extension in
 * parentheses, as in `readme (mdx).md`.
 *
 * @example
 * const tree = convertFormatsToMarkdown(prepared.tree);
 */
export function convertFormatsToMarkdown(tree: MarkdownTree): MarkdownTree {
  if (!tree.files.some((file) => fileFormatForPath(file.relativePath)?.toMarkdown)) return tree;
  const taken = new Set(tree.files.map((file) => file.relativePath.toLowerCase()));
  return {
    ...tree,
    files: tree.files.map((file) => {
      const toMarkdown = fileFormatForPath(file.relativePath)?.toMarkdown;
      const extension = extensionOf(file.relativePath);
      if (!toMarkdown || !extension) return file;
      const stem = file.relativePath.slice(0, -extension.length - 1);
      const renamed = `${stem}.md`;
      const relativePath = taken.has(renamed.toLowerCase()) ? `${stem} (${extension}).md` : renamed;
      taken.add(relativePath.toLowerCase());
      return { ...file, relativePath, content: toMarkdown(file.content) };
    }),
  };
}
