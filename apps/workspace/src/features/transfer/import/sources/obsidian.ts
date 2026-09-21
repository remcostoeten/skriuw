import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportedNoteProperty,
  ImportedPropertyValue,
  ImportWarning,
} from "@/features/transfer/import/model";
import { noteTitleFromPath, relativeLinkBetween } from "@/features/transfer/import/model";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const EMBED_PATTERN = /!\[\[([^\][\n]+)\]\]/g;
const EMBED_SIGNAL_PATTERN = /!\[\[[^\][\n]+\]\]/;
const WIKILINK_PATTERN = /(^|[^!])\[\[[^\][\n]+\]\]/;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp)$/i;
const EMBED_SIZE_PATTERN = /^\d+(x\d+)?$/;
const MAX_PROPERTIES_PER_NOTE = 64;
const MAX_PROPERTY_NAME_BYTES = 80;
const MAX_PROPERTY_VALUE_BYTES = 2_000;

type ParsedFrontmatter = {
  properties: ImportedNoteProperty[];
  tags: string[];
  complexKeys: number;
};

type AssetIndex = {
  byPath: Map<string, string>;
  byBaseName: Map<string, string[]>;
};

function isMarkdownFile(relativePath: string): boolean {
  return /\.(md|markdown)$/i.test(relativePath);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function splitTags(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(/[,\s]+/))
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => tag.length > 0);
}

function propertyValueByteLength(value: ImportedPropertyValue): number {
  if (value.type === "list") {
    return value.values.reduce((total, item) => total + byteLength(item), 0);
  }
  if (value.type === "text" || value.type === "date" || value.type === "url") {
    return byteLength(value.value);
  }
  return 0;
}

function scalarPropertyValue(value: unknown): ImportedPropertyValue | null {
  if (typeof value === "boolean") {
    return { type: "checkbox", value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "number", value };
  }
  if (typeof value !== "string") {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(value)) {
    return { type: "date", value };
  }
  if (/^https?:\/\//i.test(value)) {
    return { type: "url", value };
  }
  return { type: "text", value };
}

function parseFrontmatterBlock(block: string): ParsedFrontmatter {
  const properties: ImportedNoteProperty[] = [];
  const tags: string[] = [];
  let complexKeys = 0;
  const document = parseDocument(block, {
    schema: "core",
    uniqueKeys: true,
  });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return { properties, tags, complexKeys: 1 };
  }
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      complexKeys += 1;
      continue;
    }
    const name = pair.key.value.trim();
    let value: ImportedPropertyValue | null = null;
    if (isScalar(pair.value)) {
      value = scalarPropertyValue(pair.value.value);
    } else if (
      isSeq(pair.value) &&
      pair.value.items.every(
        (item) =>
          isScalar(item) &&
          (typeof item.value === "string" ||
            typeof item.value === "number" ||
            typeof item.value === "boolean"),
      )
    ) {
      value = {
        type: "list",
        values: pair.value.items.map((item) =>
          String(isScalar(item) ? item.value : ""),
        ),
      };
    }
    if (value === null) {
      complexKeys += 1;
      continue;
    }
    if (name === "tags" || name === "tag") {
      tags.push(...splitTags(value.type === "list" ? value.values : [String(value.value)]));
      continue;
    }
    if (
      byteLength(name) > MAX_PROPERTY_NAME_BYTES ||
      propertyValueByteLength(value) > MAX_PROPERTY_VALUE_BYTES
    ) {
      complexKeys += 1;
      continue;
    }
    properties.push({ name, value });
  }
  if (properties.length > MAX_PROPERTIES_PER_NOTE) {
    complexKeys += properties.length - MAX_PROPERTIES_PER_NOTE;
    properties.length = MAX_PROPERTIES_PER_NOTE;
  }
  return { properties, tags, complexKeys };
}

function buildAssetIndex(tree: MarkdownTree): AssetIndex {
  const byPath = new Map<string, string>();
  const byBaseName = new Map<string, string[]>();
  for (const asset of tree.assets ?? []) {
    const lowered = asset.toLowerCase();
    if (!byPath.has(lowered)) {
      byPath.set(lowered, asset);
    }
    const cut = lowered.lastIndexOf("/");
    const baseName = cut === -1 ? lowered : lowered.slice(cut + 1);
    byBaseName.set(baseName, [...(byBaseName.get(baseName) ?? []), asset]);
  }
  return { byPath, byBaseName };
}

type AssetResolution =
  | { kind: "found"; path: string }
  | { kind: "missing" }
  | { kind: "ambiguous" };

function normalizeRelativePath(base: string, target: string): string {
  const segments = base.length > 0 ? base.split("/") : [];
  for (const segment of target.replaceAll("\\", "/").split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function findAsset(
  index: AssetIndex,
  target: string,
  notePath: string,
): AssetResolution {
  const lowered = target.toLowerCase().replace(/^\.\//, "");
  const noteCut = notePath.lastIndexOf("/");
  const noteDirectory =
    noteCut === -1 ? "" : notePath.slice(0, noteCut).toLowerCase();
  const relativePath = normalizeRelativePath(noteDirectory, lowered);
  const byPath =
    index.byPath.get(lowered) ?? index.byPath.get(relativePath);
  if (byPath !== undefined) {
    return { kind: "found", path: byPath };
  }
  const cut = lowered.lastIndexOf("/");
  const matches =
    index.byBaseName.get(cut === -1 ? lowered : lowered.slice(cut + 1)) ?? [];
  if (matches.length === 1) {
    return { kind: "found", path: matches[0] ?? "" };
  }
  return matches.length > 1 ? { kind: "ambiguous" } : { kind: "missing" };
}

type EmbedConversion = {
  markdown: string;
  unresolvedImages: number;
  ambiguousImages: number;
  noteEmbeds: number;
};

function convertEmbeds(
  markdown: string,
  notePath: string,
  assets: AssetIndex,
): EmbedConversion {
  let unresolvedImages = 0;
  let ambiguousImages = 0;
  let noteEmbeds = 0;
  const converted = markdown.replace(EMBED_PATTERN, (whole, inner: string) => {
    const [rawTarget = "", ...labelParts] = inner.split("|");
    const target = rawTarget.trim();
    if (!IMAGE_EXTENSION_PATTERN.test(target)) {
      noteEmbeds += 1;
      return `[[${target}]]`;
    }
    const asset = findAsset(assets, target, notePath);
    if (asset.kind === "ambiguous") {
      ambiguousImages += 1;
      return whole;
    }
    if (asset.kind === "missing") {
      unresolvedImages += 1;
      return whole;
    }
    const label = labelParts.join("|").trim();
    const baseName = target.slice(target.lastIndexOf("/") + 1);
    const alt = label.length > 0 && !EMBED_SIZE_PATTERN.test(label) ? label : baseName;
    return `![${alt}](${relativeLinkBetween(notePath, asset.path)})`;
  });
  return { markdown: converted, unresolvedImages, ambiguousImages, noteEmbeds };
}

function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}

function parse(tree: MarkdownTree): ImportBundle {
  const assets = buildAssetIndex(tree);
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  let complexKeys = 0;
  let unresolvedImages = 0;
  let ambiguousImages = 0;
  let noteEmbeds = 0;
  for (const file of tree.files) {
    if (!isMarkdownFile(file.relativePath)) {
      continue;
    }
    let markdown = file.content;
    let frontmatter: ParsedFrontmatter | null = null;
    const originalMarkdown = markdown;
    const block = FRONTMATTER_PATTERN.exec(markdown);
    if (block) {
      markdown = markdown.slice(block[0].length);
      frontmatter = parseFrontmatterBlock(block[1] ?? "");
      complexKeys += frontmatter.complexKeys;
    }
    const preserveFrontmatter = (frontmatter?.complexKeys ?? 0) > 0;
    const conversion = preserveFrontmatter
      ? {
          markdown: originalMarkdown,
          unresolvedImages: 0,
          ambiguousImages: 0,
          noteEmbeds: 0,
        }
      : convertEmbeds(markdown, file.relativePath, assets);
    unresolvedImages += conversion.unresolvedImages;
    ambiguousImages += conversion.ambiguousImages;
    noteEmbeds += conversion.noteEmbeds;
    notes.push({
      relativePath: file.relativePath,
      title: noteTitleFromPath(file.relativePath),
      markdown: conversion.markdown,
      ...(frontmatter && frontmatter.tags.length > 0 ? { tags: frontmatter.tags } : {}),
      ...(frontmatter && frontmatter.properties.length > 0
        ? { properties: frontmatter.properties }
        : {}),
    });
  }
  const notePaths = notes.map((note) => note.relativePath);
  const directories = tree.directories.filter((directory) =>
    notePaths.some((path) => path.startsWith(`${directory}/`)),
  );
  if (complexKeys > 0) {
    warnings.push({
      message: `Skipped ${count(complexKeys, "frontmatter field")} too complex to import as properties`,
    });
  }
  if (unresolvedImages > 0) {
    warnings.push({
      message: `${count(unresolvedImages, "image embed")} matched no file in the vault and stayed as text`,
    });
  }
  if (ambiguousImages > 0) {
    warnings.push({
      message: `${count(ambiguousImages, "image embed")} matched multiple vault files and stayed as text`,
    });
  }
  if (noteEmbeds > 0) {
    warnings.push({
      message: `Converted ${count(noteEmbeds, "note embed")} to plain links`,
    });
  }
  return {
    sourceId: obsidianSource.id,
    sourceLabel: obsidianSource.label,
    directories,
    notes,
    warnings,
  };
}

export const obsidianSource: ImportSourceAdapter = {
  id: "obsidian",
  label: "Obsidian",
  detect(tree) {
    const markdownFiles = tree.files.filter((file) => isMarkdownFile(file.relativePath));
    if (markdownFiles.length === 0) {
      return 0;
    }
    const signals = markdownFiles.filter(
      (file) =>
        FRONTMATTER_PATTERN.test(file.content) ||
        EMBED_SIGNAL_PATTERN.test(file.content) ||
        WIKILINK_PATTERN.test(file.content),
    ).length;
    return signals / markdownFiles.length >= 0.3 ? 0.8 : 0;
  },
  parse,
};
