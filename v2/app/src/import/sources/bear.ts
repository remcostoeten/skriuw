import type { MarkdownTree } from "../../export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportWarning,
} from "../model";

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

type BearMetadata = {
  creationDate?: unknown;
  modificationDate?: unknown;
  trashed?: unknown;
  encrypted?: unknown;
};

function parseMetadata(content: string): BearMetadata | null {
  try {
    const root = JSON.parse(content) as Record<string, unknown>;
    const metadata = root["net.shinyfrog.bear"];
    return typeof metadata === "object" && metadata !== null
      ? (metadata as BearMetadata)
      : {};
  } catch {
    return null;
  }
}

function metadataTime(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function enabled(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function extractTags(markdown: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const covered: Array<[number, number]> = [];
  const patterns = [
    { pattern: /(^|[\s(])#([^#\n]+)#(?=$|[\s).,!?])/g, multiword: true },
    {
      pattern: /(^|[\s(])#([\p{L}\p{N}_/-]+)(?=$|[\s).,!?])/gu,
      multiword: false,
    },
  ];
  for (const { pattern, multiword } of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const tagStart = (match.index ?? 0) + (match[1]?.length ?? 0);
      if (
        !multiword &&
        covered.some(([start, end]) => tagStart >= start && tagStart < end)
      ) {
        continue;
      }
      const tag = match[2]?.trim();
      if (multiword) {
        covered.push([tagStart, (match.index ?? 0) + match[0].length]);
      }
      if (!tag || seen.has(tag.toLowerCase())) {
        continue;
      }
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  let trashed = 0;
  let encrypted = 0;
  const filesByLowerPath = new Map(
    tree.files.map((file) => [file.relativePath.toLowerCase(), file]),
  );
  for (const file of tree.files) {
    const match = TEXT_BUNDLE_NOTE.exec(file.relativePath);
    if (!match) {
      continue;
    }
    const prefix = match[1] ?? "";
    const bundleName = match[2] ?? "";
    const infoPath = `${prefix}${bundleName}.textbundle/info.json`;
    const infoFile = filesByLowerPath.get(infoPath.toLowerCase());
    const metadata = infoFile ? parseMetadata(infoFile.content) : {};
    if (metadata === null) {
      warnings.push({
        path: infoPath,
        message: "Bear metadata is malformed; note content will still import",
      });
    }
    if (enabled(metadata?.trashed)) {
      trashed += 1;
      continue;
    }
    if (enabled(metadata?.encrypted)) {
      encrypted += 1;
      continue;
    }
    const tags = extractTags(file.content);
    notes.push({
      relativePath: `${prefix}${bundleName}.md`,
      title: bundleName,
      markdown: rewriteAssetPaths(file.content, bundleName),
      ...(tags.length > 0 ? { tags } : {}),
      createdAt: metadataTime(metadata?.creationDate),
      modifiedAt: metadataTime(metadata?.modificationDate),
    });
  }
  if (trashed > 0) {
    warnings.push({
      message: `Skipped ${trashed} trashed Bear note${trashed === 1 ? "" : "s"}`,
    });
  }
  if (encrypted > 0) {
    warnings.push({
      message: `Skipped ${encrypted} encrypted Bear note${encrypted === 1 ? "" : "s"}`,
      severity: "error",
    });
  }
  return {
    sourceId: bearSource.id,
    sourceLabel: bearSource.label,
    directories: tree.directories.filter((path) => !/\.textbundle(\/|$)/i.test(path)),
    notes,
    warnings,
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
