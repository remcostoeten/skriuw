import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";

const sources = import.meta.glob<string>("./notes/**/*.md", {
  query: "?raw",
  import: "default",
});

function relativePath(globKey: string): string {
  return globKey.replace(/^\.\/notes\//, "");
}

function directoriesOf(paths: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const path of paths) {
    const cut = path.lastIndexOf("/");
    if (cut !== -1) {
      directories.add(path.slice(0, cut));
    }
  }
  return [...directories].sort();
}

export async function loadStarterTree(): Promise<MarkdownTree> {
  const entries = await Promise.all(
    Object.entries(sources).map(async ([key, load]) => ({
      relativePath: relativePath(key),
      content: await load(),
    })),
  );
  const files = entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  return {
    directories: directoriesOf(files.map((file) => file.relativePath)),
    files,
    skipped: 0,
  };
}
