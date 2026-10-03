export type MarkdownTreeFile = {
  relativePath: string;
  content: string;
};

export type MarkdownTree = {
  directories: string[];
  files: MarkdownTreeFile[];
  assets?: string[];
  unsupported?: string[];
  skipped: number;
};

export function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
